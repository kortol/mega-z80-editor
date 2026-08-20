"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAggregateLayoutFields = getAggregateLayoutFields;
exports.getAggregateLayoutSize = getAggregateLayoutSize;
exports.analyzeProgram = analyzeProgram;
const tsFrontendDiagnostics_1 = require("./tsFrontendDiagnostics");
function getAggregateLayoutFields(type) {
    const layout = currentAggregateLayouts.get(`${type.aggregateKind}:${type.name}`);
    if (!layout) {
        throw new Error(`Unknown aggregate layout '${type.aggregateKind} ${type.name}'.`);
    }
    return Array.from(layout.fields.entries())
        .sort((left, right) => left[1].offset - right[1].offset)
        .map(([name, field]) => ({ name, type: field.type, size: field.size }));
}
function getAggregateLayoutSize(type) {
    const layout = currentAggregateLayouts.get(`${type.aggregateKind}:${type.name}`);
    if (!layout) {
        throw new Error(`Unknown aggregate layout '${type.aggregateKind} ${type.name}'.`);
    }
    return layout.size;
}
const MAX_CONTROL_NESTING = 8;
let currentAggregateLayouts = new Map();
function analyzeProgram(program, sourceText, file) {
    currentAggregateLayouts = buildAggregateLayouts(program.aggregates, sourceText, file);
    const functionSymbols = new Map();
    for (const fn of program.functions) {
        if (functionSymbols.has(fn.name)) {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate function '${fn.name}()'.`, {
                file,
                offset: 0,
            });
        }
        functionSymbols.set(fn.name, {
            kind: "function",
            name: fn.name,
            returnType: toSemanticType(fn.returnType),
            params: fn.params.map((param) => toSemanticType(param.type)),
        });
    }
    const globals = program.globals.map((globalDecl) => analyzeGlobalDecl(globalDecl, sourceText, file));
    return {
        kind: "boundProgram",
        globals,
        functions: program.functions.map((fn) => analyzeFunction(fn, globals, functionSymbols, sourceText, file)),
    };
}
function analyzeGlobalDecl(globalDecl, sourceText, file) {
    return {
        kind: "global",
        name: globalDecl.name,
        type: toSemanticType(globalDecl.type),
        initializer: globalDecl.initializer,
    };
}
function analyzeFunction(fn, globals, functionSymbols, sourceText, file) {
    const functionScope = { entries: new Map() };
    for (const global of globals) {
        functionScope.entries.set(global.name, global);
    }
    const params = [];
    for (const [index, param] of fn.params.entries()) {
        if (functionScope.entries.has(param.name)) {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate parameter '${param.name}' in ${fn.name}().`, {
                file,
                offset: 0,
            });
        }
        const symbol = {
            kind: "param",
            name: param.name,
            type: toSemanticType(param.type),
            slot: index,
        };
        functionScope.entries.set(param.name, symbol);
        params.push(symbol);
    }
    const allLocals = new Map();
    const localList = [];
    const body = analyzeBlock(fn.body, functionScope, allLocals, localList, functionSymbols, fn.name, sourceText, file, 0);
    return {
        kind: "boundFunction",
        name: fn.name,
        returnType: toSemanticType(fn.returnType),
        params,
        locals: localList,
        body,
    };
}
function analyzeBlock(block, parentScope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth = 0, breakDepth = 0, controlNesting = 0) {
    const scope = { parent: parentScope, entries: new Map() };
    for (const declaration of block.declarations) {
        if (lookupVisible(scope, declaration.name) || allLocals.has(declaration.name)) {
            const existing = lookupVisible(scope, declaration.name) ?? allLocals.get(declaration.name);
            if (existing?.kind === "param") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support local '${declaration.name}' shadowing a parameter in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate local '${declaration.name}' in ${functionName}().`, {
                file,
                offset: 0,
            });
        }
        const symbol = {
            kind: "local",
            name: declaration.name,
            type: toSemanticType(declaration.type),
            storageBytes: getTypeStorageBytes(declaration.type),
            slot: localList.length,
        };
        scope.entries.set(declaration.name, symbol);
        allLocals.set(declaration.name, symbol);
        localList.push(symbol);
    }
    return {
        kind: "boundBlock",
        statements: block.statements.map((stmt) => analyzeStmt(stmt, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth, controlNesting)),
    };
}
function analyzeStmt(stmt, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth = 0, breakDepth = 0, controlNesting = 0) {
    switch (stmt.kind) {
        case "return":
            {
                const fnSymbol = functionSymbols.get(functionName);
                if (!fnSymbol) {
                    throw new Error(`Unknown function symbol '${functionName}'.`);
                }
                if (fnSymbol.returnType.kind === "void") {
                    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support returning a value from void ${functionName}().`, {
                        file,
                        offset: 0,
                    });
                }
                return {
                    kind: "return",
                    expr: fnSymbol.returnType.kind === "aggregate"
                        ? analyzeAggregateValueExpr(stmt.expr, scope, functionSymbols, fnSymbol.returnType, functionName, sourceText, file)
                        : analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
                };
            }
        case "returnVoid":
            {
                const fnSymbol = functionSymbols.get(functionName);
                if (!fnSymbol) {
                    throw new Error(`Unknown function symbol '${functionName}'.`);
                }
                if (fnSymbol.returnType.kind !== "void") {
                    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset requires a return value in non-void ${functionName}().`, {
                        file,
                        offset: 0,
                    });
                }
                return { kind: "returnVoid" };
            }
        case "expr":
            return { kind: "expr", expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file) };
        case "if":
            assertControlNesting(controlNesting + 1, functionName, sourceText, file);
            return {
                kind: "if",
                condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
                thenBlock: analyzeBlock(stmt.thenBlock, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth, controlNesting + 1),
                elseBlock: stmt.elseBlock
                    ? analyzeBlock(stmt.elseBlock, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth, controlNesting + 1)
                    : undefined,
            };
        case "while":
            assertControlNesting(controlNesting + 1, functionName, sourceText, file);
            return {
                kind: "while",
                condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
                body: analyzeBlock(stmt.body, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth + 1, breakDepth + 1, controlNesting + 1),
            };
        case "doWhile":
            assertControlNesting(controlNesting + 1, functionName, sourceText, file);
            return {
                kind: "doWhile",
                body: analyzeBlock(stmt.body, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth + 1, breakDepth + 1, controlNesting + 1),
                condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
            };
        case "for":
            {
                assertControlNesting(controlNesting + 1, functionName, sourceText, file);
                const forScope = { parent: scope, entries: new Map() };
                let initializer;
                if (stmt.initializer) {
                    initializer = analyzeForInitializer(stmt.initializer, forScope, allLocals, localList, functionSymbols, functionName, sourceText, file);
                }
                return {
                    kind: "for",
                    initializer,
                    condition: stmt.condition
                        ? analyzeExpr(stmt.condition, forScope, functionSymbols, functionName, sourceText, file)
                        : undefined,
                    step: stmt.step
                        ? analyzeSimpleStmt(stmt.step, forScope, functionSymbols, functionName, sourceText, file)
                        : undefined,
                    body: analyzeBlock(stmt.body, forScope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth + 1, breakDepth + 1, controlNesting + 1),
                };
            }
        case "switch":
            assertUniqueSwitchCaseValues(stmt.cases, functionName, sourceText, file);
            assertControlNesting(controlNesting + 1, functionName, sourceText, file);
            return {
                kind: "switch",
                expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
                cases: stmt.cases.map((entry) => ({
                    kind: "boundSwitchCase",
                    value: entry.value,
                    body: analyzeBlock(entry.body, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth + 1, controlNesting + 1),
                })),
                defaultCase: stmt.defaultCase
                    ? analyzeBlock(stmt.defaultCase, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth + 1, controlNesting + 1)
                    : undefined,
            };
        case "assign": {
            const symbol = lookupVisible(scope, stmt.name);
            if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind === "array") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local/global scalar or pointer symbols, got '${stmt.name}'.`, {
                    file,
                    offset: 0,
                });
            }
            if (symbol.kind === "global") {
                if (symbol.type.kind === "aggregate") {
                    return analyzeAggregateAssignStmt(symbol, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
                }
                return {
                    kind: "expr",
                    expr: {
                        kind: "assignGlobal",
                        global: symbol,
                        expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
                        type: symbol.type.kind === "functionPointer" ? symbol.type : getValueSemanticType(symbol.type),
                    },
                };
            }
            if (symbol.type.kind === "aggregate") {
                return analyzeAggregateAssignStmt(symbol, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
            }
            return {
                kind: "assign",
                local: symbol,
                expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
            };
        }
        case "arrayAssign":
            return analyzeIndexedAssignStmt(stmt.name, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
        case "memberAssign":
            return {
                kind: "expr",
                expr: analyzeAggregateFieldAssignExpr(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
            };
        case "memberExprAssign":
            return {
                kind: "expr",
                expr: analyzeAggregateFieldAssignExprTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
            };
        case "pointerMemberAssign":
            return {
                kind: "expr",
                expr: analyzePointerAggregateFieldAssignExpr(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
            };
        case "pointerMemberExprAssign":
            return {
                kind: "expr",
                expr: analyzePointerAggregateFieldAssignExprTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
            };
        case "break":
            if (breakDepth === 0) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports 'break' inside loops or switches in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            return { kind: "break" };
        case "continue":
            if (loopDepth === 0) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports 'continue' inside loops in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            return { kind: "continue" };
        default:
            return assertNever(stmt);
    }
}
function analyzeSimpleStmt(stmt, scope, functionSymbols, functionName, sourceText, file) {
    if (stmt.kind === "expr") {
        return { kind: "expr", expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file) };
    }
    if (stmt.kind === "arrayAssign") {
        return analyzeIndexedAssignSimpleStmt(stmt.name, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
    }
    if (stmt.kind === "memberAssign") {
        return {
            kind: "expr",
            expr: analyzeAggregateFieldAssignExpr(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
        };
    }
    if (stmt.kind === "memberExprAssign") {
        return {
            kind: "expr",
            expr: analyzeAggregateFieldAssignExprTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
        };
    }
    if (stmt.kind === "pointerMemberAssign") {
        return {
            kind: "expr",
            expr: analyzePointerAggregateFieldAssignExpr(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
        };
    }
    if (stmt.kind === "pointerMemberExprAssign") {
        return {
            kind: "expr",
            expr: analyzePointerAggregateFieldAssignExprTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
        };
    }
    const symbol = lookupVisible(scope, stmt.name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind === "array") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local symbols, got '${stmt.name}'.`, {
            file,
            offset: 0,
        });
    }
    if (symbol.kind === "global") {
        if (symbol.type.kind === "aggregate") {
            return analyzeAggregateAssignSimpleStmt(symbol, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
        }
        return {
            kind: "expr",
            expr: {
                kind: "assignGlobal",
                global: symbol,
                expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
                type: getValueSemanticType(symbol.type),
            },
        };
    }
    if (symbol.type.kind === "aggregate") {
        return analyzeAggregateAssignSimpleStmt(symbol, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
    }
    return {
        kind: "assign",
        local: symbol,
        expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
    };
}
function analyzeAggregateAssignStmt(target, expr, scope, functionSymbols, functionName, sourceText, file) {
    const source = analyzeAggregateValueExpr(expr, scope, functionSymbols, target.type, functionName, sourceText, file);
    return {
        kind: "aggregateAssign",
        target,
        source,
    };
}
function analyzeAggregateAssignSimpleStmt(target, expr, scope, functionSymbols, functionName, sourceText, file) {
    const source = analyzeAggregateValueExpr(expr, scope, functionSymbols, target.type, functionName, sourceText, file);
    return {
        kind: "aggregateAssign",
        target,
        source,
    };
}
function analyzeAggregateValueExpr(expr, scope, functionSymbols, targetType, functionName, sourceText, file) {
    switch (expr.kind) {
        case "ref": {
            const symbol = lookupVisible(scope, expr.name);
            if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value expressions from local/parameter/global aggregate symbols in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            const aggregateSymbol = symbol;
            if (targetType) {
                assertMatchingAggregateType(aggregateSymbol.type, targetType, functionName, sourceText, file);
            }
            return {
                kind: "aggregateRef",
                symbol: aggregateSymbol,
                type: aggregateSymbol.type,
            };
        }
        case "assign": {
            const symbol = lookupVisible(scope, expr.name);
            if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate assignment expressions to local/global struct/union objects in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            const aggregateTarget = symbol;
            const source = analyzeAggregateValueExpr(expr.expr, scope, functionSymbols, aggregateTarget.type, functionName, sourceText, file);
            if (targetType) {
                assertMatchingAggregateType(aggregateTarget.type, targetType, functionName, sourceText, file);
            }
            return {
                kind: "aggregateAssignExpr",
                target: aggregateTarget,
                source,
                type: aggregateTarget.type,
            };
        }
        case "comma":
            {
                const right = analyzeAggregateValueExpr(expr.right, scope, functionSymbols, targetType, functionName, sourceText, file);
                return {
                    kind: "comma",
                    left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
                    right,
                    type: right.type,
                };
            }
        case "conditional": {
            const thenExpr = analyzeAggregateValueExpr(expr.thenExpr, scope, functionSymbols, targetType, functionName, sourceText, file);
            const elseExpr = analyzeAggregateValueExpr(expr.elseExpr, scope, functionSymbols, thenExpr.type, functionName, sourceText, file);
            assertMatchingAggregateType(thenExpr.type, elseExpr.type, functionName, sourceText, file);
            return {
                kind: "conditional",
                condition: analyzeExpr(expr.condition, scope, functionSymbols, functionName, sourceText, file),
                thenExpr,
                elseExpr,
                type: thenExpr.type,
            };
        }
        case "call": {
            const target = functionSymbols.get(expr.target);
            if (!target || target.returnType.kind !== "aggregate") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value calls to defined aggregate-returning functions in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            if (target.params.length !== expr.args.length) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset expected ${target.params.length} argument(s) for ${expr.target}(), got ${expr.args.length}.`, { file, offset: 0 });
            }
            if (targetType) {
                assertMatchingAggregateType(target.returnType, targetType, functionName, sourceText, file);
            }
            return {
                kind: "call",
                target,
                args: expr.args.map((arg, index) => {
                    const paramType = target.params[index];
                    return paramType.kind === "aggregate"
                        ? analyzeAggregateValueExpr(arg, scope, functionSymbols, paramType, functionName, sourceText, file)
                        : analyzeExpr(arg, scope, functionSymbols, functionName, sourceText, file);
                }),
                type: target.returnType,
            };
        }
        default:
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value expressions from local/parameter/global aggregate symbols in ${functionName}().`, {
                file,
                offset: 0,
            });
    }
}
function assertMatchingAggregateType(sourceType, targetType, functionName, sourceText, file) {
    if (sourceType.aggregateKind !== targetType.aggregateKind
        || sourceType.name !== targetType.name
        || sourceType.size !== targetType.size) {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate assignment between matching ${targetType.aggregateKind} types in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
}
function analyzeArrayAssignStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file) {
    const symbol = lookupVisible(scope, name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || symbol.type.kind !== "array") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local/parameter char arrays, got '${name}[...]'.`, {
            file,
            offset: 0,
        });
    }
    const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
    if (symbol.kind === "local") {
        assertArrayIndexInBounds(boundIndex, name, getSizedArrayLength(symbol.type), functionName, sourceText, file);
    }
    return {
        kind: "arrayAssign",
        target: symbol,
        index: boundIndex,
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
    };
}
function analyzeIndexedAssignStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file) {
    const symbol = lookupVisible(scope, name);
    if (symbol && symbol.kind === "global" && symbol.type.kind === "array") {
        return {
            kind: "expr",
            expr: {
                kind: "globalArrayAssignExpr",
                target: symbol,
                index: analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file),
                expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
                type: toSemanticScalarType("char"),
            },
        };
    }
    if (symbol && (symbol.kind === "local" || symbol.kind === "param") && symbol.type.kind === "pointer") {
        return {
            kind: "expr",
            expr: analyzePointerIndexedAssignExpr(symbol, index, expr, scope, functionSymbols, functionName, sourceText, file),
        };
    }
    return analyzeArrayAssignStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file);
}
function analyzeIndexedAssignSimpleStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file) {
    const symbol = lookupVisible(scope, name);
    if (symbol && symbol.kind === "global" && symbol.type.kind === "array") {
        return {
            kind: "expr",
            expr: {
                kind: "globalArrayAssignExpr",
                target: symbol,
                index: analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file),
                expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
                type: toSemanticScalarType("char"),
            },
        };
    }
    if (symbol && (symbol.kind === "local" || symbol.kind === "param") && symbol.type.kind === "pointer") {
        return {
            kind: "expr",
            expr: analyzePointerIndexedAssignExpr(symbol, index, expr, scope, functionSymbols, functionName, sourceText, file),
        };
    }
    return analyzeArrayAssignStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file);
}
function analyzePointerIndexedAssignExpr(symbol, index, expr, scope, functionSymbols, functionName, sourceText, file) {
    if (symbol.type.kind !== "pointer") {
        throw new Error("Internal semantic error: expected pointer symbol.");
    }
    const pointee = getScalarPointerPointee(symbol.type, functionName, sourceText, file);
    return {
        kind: "derefAssign",
        pointer: {
            kind: "pointerAdd",
            pointer: { kind: "ref", symbol, type: symbol.type },
            index: analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file),
            pointee,
            type: symbol.type,
        },
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
        type: toSemanticScalarType(pointee),
    };
}
function analyzeAggregateFieldAssignExpr(name, fieldName, expr, scope, functionSymbols, functionName, sourceText, file) {
    const symbol = lookupVisible(scope, name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports member assignment on local/global struct/union objects, got '${name}.${fieldName}'.`, {
            file,
            offset: 0,
        });
    }
    const field = getScalarAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file);
    return {
        kind: "derefAssign",
        pointer: {
            kind: "pointerAdd",
            pointer: getAggregateStorageAddress(symbol, symbol.type),
            index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
            pointee: "char",
            type: toSemanticPointerType("char"),
        },
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
        type: field.type,
    };
}
function analyzePointerAggregateFieldAssignExpr(name, fieldName, expr, scope, functionSymbols, functionName, sourceText, file) {
    const { symbol, field } = getPointerAggregateFieldTarget(name, fieldName, scope, functionName, sourceText, file);
    return {
        kind: "derefAssign",
        pointer: {
            kind: "pointerAdd",
            pointer: { kind: "ref", symbol, type: symbol.type },
            index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
            pointee: "char",
            type: toSemanticPointerType("char"),
        },
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
        type: field.type,
    };
}
function analyzeAggregateFieldAssignExprTarget(targetExpr, fieldName, expr, scope, functionSymbols, functionName, sourceText, file) {
    const target = getAggregateFieldPointerFromTargetExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file);
    return {
        kind: "derefAssign",
        pointer: target.pointer,
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
        type: target.type,
    };
}
function analyzePointerAggregateFieldAssignExprTarget(targetExpr, fieldName, expr, scope, functionSymbols, functionName, sourceText, file) {
    const pointer = analyzeExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    const { field } = getPointerAggregateFieldFromExpr(pointer, fieldName, functionName, sourceText, file);
    return {
        kind: "derefAssign",
        pointer: {
            kind: "pointerAdd",
            pointer,
            index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
            pointee: "char",
            type: toSemanticPointerType("char"),
        },
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
        type: field.type,
    };
}
function getAggregateStorageAddress(symbol, type) {
    const pointerType = toSemanticPointerType({
        kind: "aggregate",
        aggregateKind: type.aggregateKind,
        name: type.name,
    });
    return symbol.kind === "global"
        ? { kind: "globalAddress", symbol, type: pointerType }
        : { kind: "localAddress", symbol, type: pointerType };
}
function analyzeAggregateFieldPointer(name, fieldName, scope, functionName, sourceText, file) {
    const symbol = lookupVisible(scope, name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate field access on local/global struct/union objects, got '${name}.${fieldName}'.`, {
            file,
            offset: 0,
        });
    }
    const field = getScalarAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file);
    return {
        pointer: {
            kind: "pointerAdd",
            pointer: getAggregateStorageAddress(symbol, symbol.type),
            index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
            pointee: "char",
            type: toSemanticPointerType("char"),
        },
        type: field.type,
    };
}
function analyzePointerAggregateFieldPointer(name, fieldName, scope, functionName, sourceText, file) {
    const { symbol, field } = getPointerAggregateFieldTarget(name, fieldName, scope, functionName, sourceText, file);
    return {
        pointer: {
            kind: "pointerAdd",
            pointer: { kind: "ref", symbol, type: symbol.type },
            index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
            pointee: "char",
            type: toSemanticPointerType("char"),
        },
        type: field.type,
    };
}
function getAggregateFieldPointerFromTargetExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file) {
    if (targetExpr.kind === "memberAccess"
        || targetExpr.kind === "memberExprAccess"
        || targetExpr.kind === "pointerMemberAccess"
        || targetExpr.kind === "pointerMemberExprAccess") {
        const target = getAggregateObjectPointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
        const field = getScalarAggregateFieldLayout(target.type, fieldName, functionName, sourceText, file);
        return {
            pointer: {
                kind: "pointerAdd",
                pointer: target.pointer,
                index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                pointee: "char",
                type: toSemanticPointerType("char"),
            },
            type: field.type,
        };
    }
    if (targetExpr.kind === "deref") {
        const pointer = analyzeExpr(targetExpr.expr, scope, functionSymbols, functionName, sourceText, file);
        if (pointer.type.kind !== "pointer" || typeof pointer.type.pointee === "string") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports '.' on dereferenced struct/union pointers in ${functionName}().`, {
                file,
                offset: 0,
            });
        }
        const { field } = getPointerAggregateFieldFromExpr(pointer, fieldName, functionName, sourceText, file);
        return {
            pointer: {
                kind: "pointerAdd",
                pointer,
                index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                pointee: "char",
                type: toSemanticPointerType("char"),
            },
            type: field.type,
        };
    }
    if (targetExpr.kind === "ref") {
        return analyzeAggregateFieldPointer(targetExpr.name, fieldName, scope, functionName, sourceText, file);
    }
    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports '.' on local aggregates or dereferenced struct/union pointers in ${functionName}().`, {
        file,
        offset: 0,
    });
}
function getAggregateFieldReadFromTargetExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file) {
    if (targetExpr.kind === "ref"
        || targetExpr.kind === "deref"
        || targetExpr.kind === "memberAccess"
        || targetExpr.kind === "memberExprAccess"
        || targetExpr.kind === "pointerMemberAccess"
        || targetExpr.kind === "pointerMemberExprAccess") {
        const target = getAggregateFieldPointerFromTargetExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file);
        return {
            kind: "pointer",
            pointer: target.pointer,
            type: target.type,
        };
    }
    return {
        kind: "value",
        expr: analyzeAggregateValueFieldReadExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file),
    };
}
function analyzeAggregateValueFieldReadExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file) {
    const aggregateValue = analyzeAggregateValueExpr(targetExpr, scope, functionSymbols, undefined, functionName, sourceText, file);
    return lowerAggregateValueFieldReadExpr(aggregateValue, fieldName, functionName, sourceText, file);
}
function lowerAggregateValueFieldReadExpr(expr, fieldName, functionName, sourceText, file) {
    const field = getScalarAggregateFieldLayout(expr.type, fieldName, functionName, sourceText, file);
    return {
        kind: "aggregateValueFieldAccess",
        source: expr,
        offset: field.offset,
        type: field.type,
    };
}
function analyzeForInitializer(init, scope, allLocals, localList, functionSymbols, functionName, sourceText, file) {
    if (init.kind !== "localDecl") {
        return analyzeSimpleStmt(init, scope, functionSymbols, functionName, sourceText, file);
    }
    if (lookupVisible(scope, init.name) || allLocals.has(init.name)) {
        const existing = lookupVisible(scope, init.name) ?? allLocals.get(init.name);
        if (existing?.kind === "param") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support local '${init.name}' shadowing a parameter in ${functionName}().`, {
                file,
                offset: 0,
            });
        }
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate local '${init.name}' in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    const symbol = {
        kind: "local",
        name: init.name,
        type: toSemanticType(init.type),
        storageBytes: getTypeStorageBytes(init.type),
        slot: localList.length,
    };
    scope.entries.set(init.name, symbol);
    allLocals.set(init.name, symbol);
    localList.push(symbol);
    return {
        kind: "localDecl",
        local: symbol,
        initializer: init.initializer
            ? init.initializer.kind === "expr"
                ? analyzeExpr(init.initializer.expr, scope, functionSymbols, functionName, sourceText, file)
                : (() => {
                    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not yet support brace initializers in for-loop declarations in ${functionName}().`, {
                        file,
                        offset: 0,
                    });
                })()
            : undefined,
    };
}
function analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file) {
    switch (expr.kind) {
        case "const":
            return { kind: "const", value: expr.value, type: toSemanticScalarType("int") };
        case "string":
            return { kind: "string", value: expr.value, type: toSemanticScalarType("int") };
        case "addressOf": {
            const symbol = lookupVisible(scope, expr.name);
            if (!symbol) {
                const functionSymbol = functionSymbols.get(expr.name);
                if (functionSymbol) {
                    return {
                        kind: "functionAddress",
                        name: functionSymbol.name,
                        type: toSemanticFunctionPointerType(functionSymbol),
                    };
                }
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports address-of on local/global symbols or functions, got '${expr.name}'.`, {
                    file,
                    offset: 0,
                });
            }
            if (symbol.kind !== "local" && symbol.kind !== "global") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports address-of on local/global symbols or functions, got '${expr.name}'.`, {
                    file,
                    offset: 0,
                });
            }
            if (symbol.kind === "global") {
                if (symbol.type.kind === "array") {
                    return { kind: "globalAddress", symbol, type: toSemanticPointerType("char") };
                }
                return { kind: "globalAddress", symbol, type: toSemanticPointerType(toPointerPointee(symbol.type)) };
            }
            if (symbol.type.kind === "array") {
                return { kind: "localAddress", symbol, type: toSemanticPointerType("char") };
            }
            return { kind: "localAddress", symbol, type: toSemanticPointerType(toPointerPointee(symbol.type)) };
        }
        case "addressOfExpr": {
            const target = analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file);
            if (target.kind === "localArrayElement") {
                return {
                    kind: "pointerAdd",
                    pointer: { kind: "localAddress", symbol: target.symbol, type: toSemanticPointerType("char") },
                    index: target.index,
                    pointee: "char",
                    type: toSemanticPointerType("char"),
                };
            }
            if (target.kind === "paramArrayElement") {
                return {
                    kind: "pointerAdd",
                    pointer: { kind: "ref", symbol: target.symbol, type: toSemanticPointerType("char") },
                    index: target.index,
                    pointee: "char",
                    type: toSemanticPointerType("char"),
                };
            }
            if (target.kind === "aggregateFieldAccess") {
                const aggregateType = target.symbol.type;
                return {
                    kind: "pointerAdd",
                    pointer: target.symbol.kind === "param"
                        ? {
                            kind: "ref",
                            symbol: target.symbol,
                            type: toSemanticPointerType({
                                kind: "aggregate",
                                aggregateKind: aggregateType.aggregateKind,
                                name: aggregateType.name,
                            }),
                        }
                        : getAggregateStorageAddress(target.symbol, aggregateType),
                    index: { kind: "const", value: target.offset, type: toSemanticScalarType("int") },
                    pointee: "char",
                    type: toSemanticPointerType(target.type.name),
                };
            }
            if (target.kind === "aggregateValueFieldAccess") {
                return {
                    kind: "aggregateValueFieldAddress",
                    source: target.source,
                    offset: target.offset,
                    type: toSemanticPointerType(target.type.name),
                };
            }
            if (target.kind === "deref") {
                if (target.pointer.type.kind === "pointer") {
                    return target.pointer;
                }
            }
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports address-of on locals, array elements, or dereference in ${functionName}().`, {
                file,
                offset: 0,
            });
        }
        case "ref": {
            const symbol = lookupVisible(scope, expr.name);
            if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global")) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not know symbol '${expr.name}'.`, {
                    file,
                    offset: 0,
                });
            }
            if (symbol.kind === "global") {
                if (symbol.type.kind === "array") {
                    return { kind: "globalAddress", symbol, type: toSemanticPointerType("char") };
                }
                if (symbol.type.kind === "aggregate") {
                    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not yet support aggregate object values for '${expr.name}' in ${functionName}().`, {
                        file,
                        offset: 0,
                    });
                }
                if (symbol.type.kind === "functionPointer") {
                    return { kind: "globalRef", symbol, type: symbol.type };
                }
                return { kind: "globalRef", symbol, type: getValueSemanticType(symbol.type) };
            }
            if (symbol.kind === "local" && symbol.type.kind === "array") {
                return { kind: "localAddress", symbol, type: toSemanticPointerType("char") };
            }
            if (symbol.kind === "param" && symbol.type.kind === "array") {
                return { kind: "ref", symbol, type: toSemanticPointerType("char") };
            }
            if (symbol.type.kind === "aggregate") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not yet support aggregate object values for '${expr.name}' in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            if (symbol.type.kind === "functionPointer") {
                return { kind: "ref", symbol, type: symbol.type };
            }
            return { kind: "ref", symbol, type: getValueSemanticType(symbol.type) };
        }
        case "memberAccess": {
            const symbol = lookupVisible(scope, expr.name);
            if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports member access on local/parameter/global struct/union objects, got '${expr.name}.${expr.field}'.`, {
                    file,
                    offset: 0,
                });
            }
            const field = getScalarAggregateFieldLayout(symbol.type, expr.field, functionName, sourceText, file);
            return {
                kind: "aggregateFieldAccess",
                symbol,
                offset: field.offset,
                type: field.type,
            };
        }
        case "memberExprAccess": {
            const target = getAggregateFieldReadFromTargetExpr(expr.target, expr.field, scope, functionSymbols, functionName, sourceText, file);
            if (target.kind === "value") {
                return target.expr;
            }
            return {
                kind: "deref",
                pointer: target.pointer,
                type: target.type,
            };
        }
        case "pointerMemberAccess": {
            const { symbol, field } = getPointerAggregateFieldTarget(expr.name, expr.field, scope, functionName, sourceText, file);
            return {
                kind: "deref",
                pointer: {
                    kind: "pointerAdd",
                    pointer: { kind: "ref", symbol, type: symbol.type },
                    index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                    pointee: "char",
                    type: toSemanticPointerType("char"),
                },
                type: field.type,
            };
        }
        case "pointerMemberExprAccess": {
            const pointer = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
            const { field } = getPointerAggregateFieldFromExpr(pointer, expr.field, functionName, sourceText, file);
            return {
                kind: "deref",
                pointer: {
                    kind: "pointerAdd",
                    pointer,
                    index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                    pointee: "char",
                    type: toSemanticPointerType("char"),
                },
                type: field.type,
            };
        }
        case "deref": {
            const pointer = analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file);
            if (pointer.type.kind !== "pointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports dereference on pointer values in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            const pointee = getScalarPointerPointee(pointer.type, functionName, sourceText, file);
            return {
                kind: "deref",
                pointer,
                type: toSemanticScalarType(pointee),
            };
        }
        case "arrayIndex": {
            const symbol = lookupVisible(scope, expr.name);
            if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global")) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not know symbol '${expr.name}'.`, {
                    file,
                    offset: 0,
                });
            }
            if (symbol.type.kind === "pointer") {
                const pointee = getScalarPointerPointee(symbol.type, functionName, sourceText, file);
                return {
                    kind: "deref",
                    pointer: {
                        kind: "pointerAdd",
                        pointer: symbol.kind === "global"
                            ? { kind: "globalRef", symbol, type: symbol.type }
                            : { kind: "ref", symbol, type: symbol.type },
                        index: analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file),
                        pointee,
                        type: symbol.type,
                    },
                    type: toSemanticScalarType(pointee),
                };
            }
            if (symbol.type.kind !== "array") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports indexing on local/parameter char arrays or pointers, got '${expr.name}[...]'.`, {
                    file,
                    offset: 0,
                });
            }
            const index = analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file);
            if (symbol.kind === "global") {
                return {
                    kind: "globalArrayElement",
                    symbol,
                    index,
                    type: toSemanticScalarType("char"),
                };
            }
            if (symbol.kind === "param") {
                return {
                    kind: "paramArrayElement",
                    symbol,
                    index,
                    type: toSemanticScalarType("char"),
                };
            }
            assertArrayIndexInBounds(index, expr.name, getSizedArrayLength(symbol.type), functionName, sourceText, file);
            return {
                kind: "localArrayElement",
                symbol,
                index,
                type: toSemanticScalarType("char"),
            };
        }
        case "call": {
            const target = functionSymbols.get(expr.target);
            if (target && target.params.length !== expr.args.length) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset expected ${target.params.length} argument(s) for ${expr.target}(), got ${expr.args.length}.`, { file, offset: 0 });
            }
            if (target?.returnType.kind === "aggregate") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not yet support aggregate-returning calls in scalar expression position in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            if (!target) {
                const symbol = lookupVisible(scope, expr.target);
                if (symbol && (symbol.kind === "local" || symbol.kind === "param" || symbol.kind === "global") && symbol.type.kind === "functionPointer") {
                    const signature = symbol.type;
                    if (symbol.type.params.length !== expr.args.length) {
                        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset expected ${symbol.type.params.length} argument(s) for indirect call '${expr.target}()', got ${expr.args.length}.`, { file, offset: 0 });
                    }
                    return {
                        kind: "indirectCall",
                        target: symbol.kind === "global"
                            ? { kind: "globalRef", symbol, type: symbol.type }
                            : { kind: "ref", symbol, type: symbol.type },
                        signature,
                        args: expr.args.map((arg, index) => analyzeCallArg(arg, signature.params[index], scope, functionSymbols, functionName, sourceText, file)),
                        type: signature.returnType.kind === "void"
                            ? toSemanticScalarType("int")
                            : signature.returnType,
                    };
                }
            }
            return {
                kind: "call",
                target: target ?? { kind: "extern", name: expr.target },
                args: expr.args.map((arg, index) => analyzeCallArg(arg, target?.params[index], scope, functionSymbols, functionName, sourceText, file)),
                type: !target || target.returnType.kind === "void"
                    ? toSemanticScalarType("int")
                    : target.returnType,
            };
        }
        case "indirectCall": {
            const target = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
            if (target.type.kind !== "functionPointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports indirect call through function pointers in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            const signature = target.type;
            if (target.type.params.length !== expr.args.length) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset expected ${target.type.params.length} argument(s) for indirect call, got ${expr.args.length}.`, { file, offset: 0 });
            }
            return {
                kind: "indirectCall",
                target,
                signature,
                args: expr.args.map((arg, index) => analyzeCallArg(arg, signature.params[index], scope, functionSymbols, functionName, sourceText, file)),
                type: signature.returnType.kind === "void"
                    ? toSemanticScalarType("int")
                    : signature.returnType,
            };
        }
        case "preIncDec":
        case "postIncDec": {
            const symbol = lookupVisible(scope, expr.name);
            if (!symbol || symbol.kind !== "local" || symbol.type.kind === "array") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports increment/decrement on local scalar/pointer symbols, got '${expr.name}'.`, {
                    file,
                    offset: 0,
                });
            }
            if (symbol.type.kind === "functionPointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support increment/decrement on function pointers in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            return {
                kind: expr.kind,
                local: symbol,
                op: expr.op,
                type: getValueSemanticType(symbol.type),
            };
        }
        case "preArrayIncDec":
        case "postArrayIncDec": {
            const symbol = lookupVisible(scope, expr.name);
            if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || (symbol.type.kind !== "array" && symbol.type.kind !== "pointer")) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports increment/decrement on local/parameter char arrays or scalar pointers, got '${expr.name}[...]'.`, {
                    file,
                    offset: 0,
                });
            }
            const boundIndex = analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file);
            if (symbol.type.kind === "pointer") {
                const pointee = getScalarPointerPointee(symbol.type, functionName, sourceText, file);
                return {
                    kind: "derefIncDec",
                    pointer: {
                        kind: "pointerAdd",
                        pointer: { kind: "ref", symbol, type: symbol.type },
                        index: boundIndex,
                        pointee,
                        type: symbol.type,
                    },
                    op: expr.op,
                    mode: expr.kind === "preArrayIncDec" ? "prefix" : "postfix",
                    type: toSemanticScalarType(pointee),
                };
            }
            if (symbol.kind === "local") {
                assertArrayIndexInBounds(boundIndex, expr.name, getSizedArrayLength(symbol.type), functionName, sourceText, file);
            }
            return {
                kind: expr.kind,
                target: symbol,
                index: boundIndex,
                op: expr.op,
                type: toSemanticScalarType("char"),
            };
        }
        case "preDerefIncDec":
        case "postDerefIncDec": {
            const target = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
            const pointer = target.kind === "deref" ? target.pointer : target;
            if (pointer.type.kind !== "pointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports increment/decrement on dereferenced scalar pointers in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            const pointee = getScalarPointerPointee(pointer.type, functionName, sourceText, file);
            return {
                kind: "derefIncDec",
                pointer,
                op: expr.op,
                mode: expr.kind === "preDerefIncDec" ? "prefix" : "postfix",
                type: toSemanticScalarType(pointee),
            };
        }
        case "preMemberIncDec":
        case "postMemberIncDec": {
            const target = analyzeAggregateFieldPointer(expr.name, expr.field, scope, functionName, sourceText, file);
            return {
                kind: "derefIncDec",
                pointer: target.pointer,
                op: expr.op,
                mode: expr.kind === "preMemberIncDec" ? "prefix" : "postfix",
                type: target.type,
            };
        }
        case "preMemberExprIncDec":
        case "postMemberExprIncDec": {
            const target = getAggregateFieldPointerFromTargetExpr(expr.target, expr.field, scope, functionSymbols, functionName, sourceText, file);
            return {
                kind: "derefIncDec",
                pointer: target.pointer,
                op: expr.op,
                mode: expr.kind === "preMemberExprIncDec" ? "prefix" : "postfix",
                type: target.type,
            };
        }
        case "prePointerMemberIncDec":
        case "postPointerMemberIncDec": {
            const target = analyzePointerAggregateFieldPointer(expr.name, expr.field, scope, functionName, sourceText, file);
            return {
                kind: "derefIncDec",
                pointer: target.pointer,
                op: expr.op,
                mode: expr.kind === "prePointerMemberIncDec" ? "prefix" : "postfix",
                type: target.type,
            };
        }
        case "prePointerMemberExprIncDec":
        case "postPointerMemberExprIncDec": {
            const pointer = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
            const { field } = getPointerAggregateFieldFromExpr(pointer, expr.field, functionName, sourceText, file);
            return {
                kind: "derefIncDec",
                pointer: {
                    kind: "pointerAdd",
                    pointer,
                    index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                    pointee: "char",
                    type: toSemanticPointerType("char"),
                },
                op: expr.op,
                mode: expr.kind === "prePointerMemberExprIncDec" ? "prefix" : "postfix",
                type: field.type,
            };
        }
        case "assign": {
            const symbol = lookupVisible(scope, expr.name);
            if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind === "array") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local/global scalar or pointer symbols, got '${expr.name}'.`, {
                    file,
                    offset: 0,
                });
            }
            if (symbol.kind === "global") {
                return {
                    kind: "assignGlobal",
                    global: symbol,
                    expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
                    type: symbol.type.kind === "functionPointer" ? symbol.type : getValueSemanticType(symbol.type),
                };
            }
            return {
                kind: "assign",
                local: symbol,
                expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
                type: getValueSemanticType(symbol.type),
            };
        }
        case "arrayAssign": {
            const symbol = lookupVisible(scope, expr.name);
            if (symbol && (symbol.kind === "local" || symbol.kind === "param") && symbol.type.kind === "pointer") {
                return analyzePointerIndexedAssignExpr(symbol, expr.index, expr.expr, scope, functionSymbols, functionName, sourceText, file);
            }
            if (symbol && symbol.kind === "global" && symbol.type.kind === "array") {
                return {
                    kind: "globalArrayAssignExpr",
                    target: symbol,
                    index: analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file),
                    expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
                    type: toSemanticScalarType("char"),
                };
            }
            const stmt = analyzeArrayAssignStmt(expr.name, expr.index, expr.expr, scope, functionSymbols, functionName, sourceText, file);
            return {
                kind: "arrayAssignExpr",
                target: stmt.target,
                index: stmt.index,
                expr: stmt.expr,
                type: toSemanticScalarType("char"),
            };
        }
        case "memberAssign":
            return analyzeAggregateFieldAssignExpr(expr.name, expr.field, expr.expr, scope, functionSymbols, functionName, sourceText, file);
        case "memberExprAssign":
            return analyzeAggregateFieldAssignExprTarget(expr.target, expr.field, expr.expr, scope, functionSymbols, functionName, sourceText, file);
        case "pointerMemberAssign":
            return analyzePointerAggregateFieldAssignExpr(expr.name, expr.field, expr.expr, scope, functionSymbols, functionName, sourceText, file);
        case "pointerMemberExprAssign":
            return analyzePointerAggregateFieldAssignExprTarget(expr.target, expr.field, expr.expr, scope, functionSymbols, functionName, sourceText, file);
        case "derefAssign": {
            const target = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
            const pointer = target.kind === "deref" ? target.pointer : target;
            if (pointer.type.kind !== "pointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports pointer assignment through dereference in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            const pointee = getScalarPointerPointee(pointer.type, functionName, sourceText, file);
            return {
                kind: "derefAssign",
                pointer,
                expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
                type: toSemanticScalarType(pointee),
            };
        }
        case "sizeofType":
            return {
                kind: "const",
                value: getTypeStorageBytes(expr.type),
                type: toSemanticScalarType("int"),
            };
        case "sizeofExpr": {
            return {
                kind: "const",
                value: getSourceExprStorageBytes(expr.expr, scope, functionSymbols, functionName, sourceText, file),
                type: toSemanticScalarType("int"),
            };
        }
        case "cast": {
            const targetType = toSemanticType(expr.type);
            if (targetType.kind !== "scalar" && targetType.kind !== "pointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar/pointer casts in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            const source = analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file);
            if (targetType.kind === "pointer") {
                if (source.type.kind !== "pointer" && source.type.kind !== "scalar") {
                    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar/pointer casts in ${functionName}().`, {
                        file,
                        offset: 0,
                    });
                }
                return { kind: "cast", expr: source, type: targetType };
            }
            if (source.kind === "const") {
                return {
                    kind: "const",
                    value: targetType.width === 1 ? (source.value & 0xFF) : (source.value & 0xFFFF),
                    type: targetType,
                };
            }
            return {
                kind: "cast",
                expr: source,
                type: targetType,
            };
        }
        case "comma": {
            const left = analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file);
            const right = analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file);
            if (right.type.kind === "functionPointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support comma expressions yielding function pointers in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            return {
                kind: "comma",
                left,
                right,
                type: right.type,
            };
        }
        case "conditional": {
            const condition = analyzeExpr(expr.condition, scope, functionSymbols, functionName, sourceText, file);
            const thenExpr = analyzeExpr(expr.thenExpr, scope, functionSymbols, functionName, sourceText, file);
            const elseExpr = analyzeExpr(expr.elseExpr, scope, functionSymbols, functionName, sourceText, file);
            return {
                kind: "conditional",
                condition,
                thenExpr,
                elseExpr,
                type: getConditionalResultType(thenExpr, elseExpr, functionName, sourceText, file),
            };
        }
        case "binary":
            if (isLogicalOp(expr.op)) {
                return {
                    kind: "logical",
                    left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
                    right: analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file),
                    op: expr.op,
                    type: toSemanticScalarType("int"),
                };
            }
            if (isBitwiseOp(expr.op)) {
                return {
                    kind: "bitwise",
                    left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
                    right: analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file),
                    op: expr.op,
                    type: toSemanticScalarType("int"),
                };
            }
            if (isShiftOp(expr.op)) {
                return {
                    kind: "shift",
                    left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
                    right: analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file),
                    op: expr.op,
                    type: toSemanticScalarType("int"),
                };
            }
            if (isCompareOp(expr.op)) {
                return {
                    kind: "compare",
                    left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
                    right: analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file),
                    op: expr.op,
                    type: toSemanticScalarType("int"),
                };
            }
            if (isMultiplicativeOp(expr.op)) {
                return {
                    kind: "multiplicative",
                    left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
                    right: analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file),
                    op: expr.op,
                    type: toSemanticScalarType("int"),
                };
            }
            {
                const left = analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file);
                const right = analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file);
                if (left.type.kind === "pointer" && right.type.kind === "scalar") {
                    const pointee = getScalarPointerPointee(left.type, functionName, sourceText, file);
                    return {
                        kind: "pointerAdd",
                        pointer: left,
                        index: expr.op === "+"
                            ? right
                            : {
                                kind: "additive",
                                left: { kind: "const", value: 0, type: toSemanticScalarType("int") },
                                right,
                                op: "-",
                                type: toSemanticScalarType("int"),
                            },
                        pointee,
                        type: left.type,
                    };
                }
                if (left.type.kind === "scalar" && right.type.kind === "pointer" && expr.op === "+") {
                    const pointee = getScalarPointerPointee(right.type, functionName, sourceText, file);
                    return {
                        kind: "pointerAdd",
                        pointer: right,
                        index: left,
                        pointee,
                        type: right.type,
                    };
                }
                return {
                    kind: "additive",
                    left,
                    right,
                    op: expr.op,
                    type: toSemanticScalarType("int"),
                };
            }
        default:
            return assertNever(expr);
    }
}
function analyzeCallArg(arg, paramType, scope, functionSymbols, functionName, sourceText, file) {
    if (paramType?.kind === "aggregate") {
        return analyzeAggregateValueExpr(arg, scope, functionSymbols, paramType, functionName, sourceText, file);
    }
    return analyzeExpr(arg, scope, functionSymbols, functionName, sourceText, file);
}
function lookupVisible(scope, name) {
    let current = scope;
    while (current) {
        const symbol = current.entries.get(name);
        if (symbol) {
            return symbol;
        }
        current = current.parent;
    }
    return undefined;
}
function isCompareOp(op) {
    return op === "==" || op === "!=" || op === ">" || op === "<" || op === ">=" || op === "<=";
}
function isLogicalOp(op) {
    return op === "&&" || op === "||";
}
function isBitwiseOp(op) {
    return op === "&" || op === "^" || op === "|";
}
function isShiftOp(op) {
    return op === "<<" || op === ">>";
}
function isMultiplicativeOp(op) {
    return op === "*" || op === "/" || op === "%";
}
function toSemanticType(type) {
    if (typeof type === "string") {
        return toSemanticScalarType(type);
    }
    if (type.kind === "void") {
        return type;
    }
    if (type.kind === "scalar") {
        return toSemanticScalarType(type.name);
    }
    if (type.kind === "aggregate") {
        const layout = currentAggregateLayouts.get(`${type.aggregateKind}:${type.name}`);
        if (!layout) {
            throw new Error(`Unknown aggregate type '${type.aggregateKind} ${type.name}'.`);
        }
        return {
            kind: "aggregate",
            aggregateKind: type.aggregateKind,
            name: type.name,
            size: layout.size,
        };
    }
    if (type.kind === "pointer") {
        return toSemanticPointerType(type.pointee);
    }
    if (type.kind === "functionPointer") {
        return {
            kind: "functionPointer",
            returnType: toSemanticType(type.returnType),
            params: type.params.map((param) => toSemanticType(param)),
            width: 2,
        };
    }
    return {
        kind: "array",
        elementType: type.elementType,
        length: type.length,
    };
}
function toSemanticFunctionPointerType(fn) {
    return {
        kind: "functionPointer",
        returnType: fn.returnType,
        params: fn.params,
        width: 2,
    };
}
function toSemanticScalarType(type) {
    return {
        kind: "scalar",
        name: type,
        width: type === "char" ? 1 : 2,
    };
}
function toSemanticPointerType(pointee) {
    return {
        kind: "pointer",
        pointee,
        width: 2,
    };
}
function toPointerPointee(type) {
    switch (type.kind) {
        case "void":
            throw new Error(`Expected non-void type for pointer pointee conversion, got ${JSON.stringify(type)}`);
        case "scalar":
            return type.name;
        case "aggregate":
            return {
                kind: "aggregate",
                aggregateKind: type.aggregateKind,
                name: type.name,
            };
        case "pointer":
            return {
                kind: "pointer",
                pointee: type.pointee,
            };
        case "functionPointer":
            throw new Error(`Expected scalar/aggregate pointer pointee, got function pointer ${JSON.stringify(type)}`);
        case "array":
            throw new Error(`Expected non-array type for pointer pointee conversion, got ${JSON.stringify(type)}`);
        default:
            return assertNever(type);
    }
}
function getTypeStorageBytes(type) {
    if (type.kind === "void") {
        throw new Error("Void type has no storage bytes.");
    }
    if (type.kind === "scalar") {
        return type.name === "char" ? 1 : 2;
    }
    if (type.kind === "aggregate") {
        const layout = currentAggregateLayouts.get(`${type.aggregateKind}:${type.name}`);
        if (!layout) {
            throw new Error(`Unknown aggregate type '${type.aggregateKind} ${type.name}'.`);
        }
        return layout.size;
    }
    if (type.kind === "pointer") {
        return 2;
    }
    if (type.kind === "functionPointer") {
        return 2;
    }
    if (type.length === undefined) {
        throw new Error(`Unsized arrays are only supported for parameters, got ${JSON.stringify(type)}`);
    }
    return type.length;
}
function getBoundExprStorageBytes(expr) {
    switch (expr.kind) {
        case "const":
        case "string":
        case "ref":
        case "functionAddress":
        case "call":
        case "indirectCall":
        case "preIncDec":
        case "postIncDec":
        case "assign":
        case "compare":
        case "logical":
        case "bitwise":
        case "shift":
        case "multiplicative":
        case "additive":
        case "conditional":
            return expr.type.width;
        case "localAddress":
        case "aggregateFieldAccess":
        case "aggregateValueFieldAccess":
        case "aggregateValueFieldAddress":
        case "pointerAdd":
        case "deref":
        case "derefAssign":
        case "derefIncDec":
            return expr.type.width;
        case "localArrayElement":
        case "paramArrayElement":
        case "globalArrayElement":
        case "preArrayIncDec":
        case "postArrayIncDec":
        case "arrayAssignExpr":
        case "globalArrayAssignExpr":
        case "cast":
        case "comma":
        case "globalRef":
        case "globalAddress":
        case "assignGlobal":
            return expr.type.width;
        default:
            return assertNever(expr);
    }
}
function getSourceExprStorageBytes(expr, scope, functionSymbols, functionName, sourceText, file) {
    if (expr.kind === "ref") {
        const symbol = lookupVisible(scope, expr.name);
        if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param")) {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not know symbol '${expr.name}'.`, {
                file,
                offset: 0,
            });
        }
        return symbol.type.kind === "array"
            ? symbol.type.length ?? 2
            : symbol.type.kind === "aggregate"
                ? symbol.type.size
                : symbol.type.kind === "void"
                    ? (() => {
                        throw new Error(`Void expressions have no storage bytes: ${JSON.stringify(symbol.type)}`);
                    })()
                    : symbol.type.width;
    }
    const boundExpr = analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file);
    return getBoundExprStorageBytes(boundExpr);
}
function getScalarSourceType(type) {
    if (type.kind !== "scalar") {
        throw new Error(`Expected scalar source type, got ${JSON.stringify(type)}`);
    }
    return type;
}
function getScalarSemanticType(type) {
    if (type.kind !== "scalar") {
        throw new Error(`Expected scalar semantic type, got ${JSON.stringify(type)}`);
    }
    return type;
}
function getValueSemanticType(type) {
    if (type.kind === "void" || type.kind === "array" || type.kind === "aggregate" || type.kind === "functionPointer") {
        throw new Error(`Expected scalar or pointer semantic type, got ${JSON.stringify(type)}`);
    }
    return type;
}
function getConditionalResultType(thenExpr, elseExpr, functionName, sourceText, file) {
    if (thenExpr.type.kind === "pointer" && elseExpr.type.kind === "pointer") {
        if (samePointerType(thenExpr.type, elseExpr.type)) {
            return thenExpr.type;
        }
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports conditional expressions with matching pointer branch types in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    if (thenExpr.type.kind === "pointer" && isZeroConstantExpr(elseExpr)) {
        return thenExpr.type;
    }
    if (elseExpr.type.kind === "pointer" && isZeroConstantExpr(thenExpr)) {
        return elseExpr.type;
    }
    return toSemanticScalarType("int");
}
function samePointerType(left, right) {
    return samePointerPointee(left.pointee, right.pointee);
}
function samePointerPointee(left, right) {
    if (typeof left === "string" || typeof right === "string") {
        return left === right;
    }
    if (left.kind === "aggregate" || right.kind === "aggregate") {
        return left.kind === "aggregate"
            && right.kind === "aggregate"
            && left.aggregateKind === right.aggregateKind
            && left.name === right.name;
    }
    return samePointerPointee(left.pointee, right.pointee);
}
function isZeroConstantExpr(expr) {
    return expr.kind === "const" && expr.value === 0;
}
function getScalarPointerPointee(type, functionName, sourceText, file) {
    if (typeof type.pointee === "string") {
        return type.pointee;
    }
    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not yet support ${formatPointerPointee(type.pointee)} pointee layout operations in ${functionName}().`, { file, offset: 0 });
}
function formatPointerPointee(type) {
    if (type.kind === "aggregate") {
        return `${type.aggregateKind} ${type.name}`;
    }
    return `${formatPointerPointee(type.pointee)} *`;
}
function buildAggregateLayouts(defs, sourceText, file) {
    const defsByKey = new Map();
    const layouts = new Map();
    for (const def of defs) {
        const key = `${def.aggregateKind}:${def.name}`;
        if (defsByKey.has(key)) {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate ${def.aggregateKind} tag '${def.name}'.`, {
                file,
                offset: 0,
            });
        }
        defsByKey.set(key, def);
    }
    const resolving = new Set();
    const resolveFieldSize = (type) => {
        if (type.kind === "void") {
            throw new Error("Void type has no storage bytes.");
        }
        if (type.kind === "scalar") {
            return type.name === "char" ? 1 : 2;
        }
        if (type.kind === "pointer" || type.kind === "functionPointer") {
            return 2;
        }
        if (type.kind === "array") {
            if (type.length === undefined) {
                throw new Error(`Unsized arrays are only supported for parameters, got ${JSON.stringify(type)}`);
            }
            return type.length;
        }
        return resolveLayout(`${type.aggregateKind}:${type.name}`).size;
    };
    const resolveLayout = (key) => {
        const existing = layouts.get(key);
        if (existing) {
            return existing;
        }
        const def = defsByKey.get(key);
        if (!def) {
            const [aggregateKind, name] = key.split(":");
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not know ${aggregateKind} ${name} for aggregate layout.`, {
                file,
                offset: 0,
            });
        }
        if (resolving.has(key)) {
            const [aggregateKind, name] = key.split(":");
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support recursive ${aggregateKind} ${name} fields by value.`, {
                file,
                offset: 0,
            });
        }
        resolving.add(key);
        const fields = new Map();
        let runningOffset = 0;
        let maxFieldSize = 0;
        for (const field of def.fields) {
            if (fields.has(field.name)) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate field '${field.name}' in ${def.aggregateKind} ${def.name}.`, {
                    file,
                    offset: 0,
                });
            }
            const fieldSize = resolveFieldSize(field.type);
            fields.set(field.name, {
                offset: def.aggregateKind === "struct" ? runningOffset : 0,
                type: field.type,
                size: fieldSize,
            });
            if (def.aggregateKind === "struct") {
                runningOffset += fieldSize;
            }
            else if (fieldSize > maxFieldSize) {
                maxFieldSize = fieldSize;
            }
        }
        const layout = {
            kind: "aggregateLayout",
            aggregateKind: def.aggregateKind,
            name: def.name,
            size: def.aggregateKind === "struct" ? runningOffset : maxFieldSize,
            fields,
        };
        layouts.set(key, layout);
        resolving.delete(key);
        return layout;
    };
    for (const key of defsByKey.keys()) {
        resolveLayout(key);
    }
    return layouts;
}
function getAggregateFieldLayout(type, fieldName, functionName, sourceText, file) {
    const layout = currentAggregateLayouts.get(`${type.aggregateKind}:${type.name}`);
    if (!layout) {
        throw new Error(`Unknown aggregate type '${type.aggregateKind} ${type.name}'.`);
    }
    const field = layout.fields.get(fieldName);
    if (!field) {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support unknown field '${fieldName}' on ${type.aggregateKind} ${type.name} in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    return field;
}
function getScalarAggregateFieldLayout(type, fieldName, functionName, sourceText, file) {
    const field = getAggregateFieldLayout(type, fieldName, functionName, sourceText, file);
    if (field.type.kind !== "scalar") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar field access on ${type.aggregateKind} ${type.name}.${fieldName} in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    return {
        offset: field.offset,
        type: toSemanticScalarType(field.type.name),
    };
}
function getPointerAggregateFieldTarget(name, fieldName, scope, functionName, sourceText, file) {
    const symbol = lookupVisible(scope, name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || symbol.type.kind !== "pointer") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers, got '${name}->${fieldName}' in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    const aggregatePointee = getAggregatePointerPointee(symbol.type, functionName, sourceText, file);
    const layout = currentAggregateLayouts.get(`${aggregatePointee.aggregateKind}:${aggregatePointee.name}`);
    if (!layout) {
        throw new Error(`Unknown aggregate type '${aggregatePointee.aggregateKind} ${aggregatePointee.name}'.`);
    }
    const field = layout.fields.get(fieldName);
    if (!field) {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support unknown field '${fieldName}' on ${aggregatePointee.aggregateKind} ${aggregatePointee.name} in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    if (field.type.kind !== "scalar") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar field access on ${aggregatePointee.aggregateKind} ${aggregatePointee.name}->${fieldName} in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    return {
        symbol: symbol,
        field: { offset: field.offset, type: toSemanticScalarType(field.type.name) },
    };
}
function getPointerAggregateFieldFromExpr(pointer, fieldName, functionName, sourceText, file) {
    if (pointer.type.kind !== "pointer") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointer expressions in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
    const layout = currentAggregateLayouts.get(`${aggregatePointee.aggregateKind}:${aggregatePointee.name}`);
    if (!layout) {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not know ${aggregatePointee.aggregateKind} ${aggregatePointee.name} for pointer-member access in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    const field = layout.fields.get(fieldName);
    if (!field) {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not know field '${fieldName}' on ${aggregatePointee.aggregateKind} ${aggregatePointee.name} in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    if (field.type.kind !== "scalar") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar field access on ${aggregatePointee.aggregateKind} ${aggregatePointee.name}->${fieldName} in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    return { field: { offset: field.offset, type: toSemanticScalarType(field.type.name) } };
}
function getAggregateObjectPointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file) {
    if (targetExpr.kind === "pointerMemberAccess" || targetExpr.kind === "pointerMemberExprAccess") {
        const pointer = targetExpr.kind === "pointerMemberAccess"
            ? (() => {
                const symbol = lookupVisible(scope, targetExpr.name);
                if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || symbol.type.kind !== "pointer") {
                    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers, got '${targetExpr.name}->${targetExpr.field}' in ${functionName}().`, {
                        file,
                        offset: 0,
                    });
                }
                return { kind: "ref", symbol, type: symbol.type };
            })()
            : analyzeExpr(targetExpr.target, scope, functionSymbols, functionName, sourceText, file);
        if (pointer.type.kind !== "pointer") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested pointer-member access on struct/union pointers in ${functionName}().`, {
                file,
                offset: 0,
            });
        }
        const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
        const field = getAggregateFieldLayout(toSemanticType({
            kind: "aggregate",
            aggregateKind: aggregatePointee.aggregateKind,
            name: aggregatePointee.name,
        }), targetExpr.field, functionName, sourceText, file);
        if (field.type.kind !== "aggregate") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested pointer-member access through aggregate fields in ${functionName}().`, {
                file,
                offset: 0,
            });
        }
        return {
            pointer: {
                kind: "pointerAdd",
                pointer,
                index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                pointee: "char",
                type: toSemanticPointerType("char"),
            },
            type: toSemanticType(field.type),
        };
    }
    const baseExpr = targetExpr.kind === "memberAccess"
        ? { kind: "ref", name: targetExpr.name }
        : targetExpr.target;
    const baseTarget = getAggregateBasePointerFromExpr(baseExpr, scope, functionSymbols, functionName, sourceText, file);
    const field = getAggregateFieldLayout(baseTarget.type, targetExpr.field, functionName, sourceText, file);
    if (field.type.kind !== "aggregate") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested aggregate member chains through aggregate fields in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    return {
        pointer: {
            kind: "pointerAdd",
            pointer: baseTarget.pointer,
            index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
            pointee: "char",
            type: toSemanticPointerType("char"),
        },
        type: toSemanticType(field.type),
    };
}
function getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file) {
    if (targetExpr.kind === "ref") {
        const symbol = lookupVisible(scope, targetExpr.name);
        if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested aggregate lvalues on local/global struct/union objects in ${functionName}().`, {
                file,
                offset: 0,
            });
        }
        return {
            pointer: {
                ...getAggregateStorageAddress(symbol, symbol.type),
            },
            type: symbol.type,
        };
    }
    if (targetExpr.kind === "deref") {
        const pointer = analyzeExpr(targetExpr.expr, scope, functionSymbols, functionName, sourceText, file);
        if (pointer.type.kind !== "pointer" || typeof pointer.type.pointee === "string") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested aggregate lvalues on dereferenced struct/union pointers in ${functionName}().`, {
                file,
                offset: 0,
            });
        }
        const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
        return {
            pointer,
            type: toSemanticType({
                kind: "aggregate",
                aggregateKind: aggregatePointee.aggregateKind,
                name: aggregatePointee.name,
            }),
        };
    }
    if (targetExpr.kind === "memberAccess"
        || targetExpr.kind === "memberExprAccess"
        || targetExpr.kind === "pointerMemberAccess"
        || targetExpr.kind === "pointerMemberExprAccess") {
        return getAggregateObjectPointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    }
    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested aggregate lvalues on local aggregates or dereferenced struct/union pointers in ${functionName}().`, {
        file,
        offset: 0,
    });
}
function getAggregatePointerPointee(type, functionName, sourceText, file) {
    if (typeof type.pointee !== "string" && type.pointee.kind === "aggregate") {
        return type.pointee;
    }
    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers in ${functionName}().`, {
        file,
        offset: 0,
    });
}
function getSizedArrayLength(type) {
    if (type.length === undefined) {
        throw new Error(`Expected sized array type, got ${JSON.stringify(type)}`);
    }
    return type.length;
}
function assertUniqueSwitchCaseValues(cases, functionName, sourceText, file) {
    const seen = new Set();
    for (const entry of cases) {
        if (seen.has(entry.value)) {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate case value '${entry.value}' in ${functionName}().`, {
                file,
                offset: 0,
            });
        }
        seen.add(entry.value);
    }
}
function assertArrayIndexInBounds(index, name, length, functionName, sourceText, file) {
    if (index.kind !== "const") {
        return;
    }
    if (index.value >= 0 && index.value < length) {
        return;
    }
    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset array index ${index.value} is out of bounds for '${name}[${length}]' in ${functionName}().`, {
        file,
        offset: 0,
    });
}
function assertControlNesting(depth, functionName, sourceText, file) {
    if (depth <= MAX_CONTROL_NESTING) {
        return;
    }
    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports control-flow nesting up to ${MAX_CONTROL_NESTING} levels in ${functionName}().`, { file, offset: 0 });
}
function assertNever(value) {
    throw new Error(`Unhandled semantic node: ${JSON.stringify(value)}`);
}

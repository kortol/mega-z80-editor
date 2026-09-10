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
let currentRuntimeVariadicNames = new Set();
function analyzeProgram(program, sourceText, file, options = {}) {
    currentAggregateLayouts = buildAggregateLayouts(program.aggregates, sourceText, file);
    currentRuntimeVariadicNames = options.runtimeVariadicNames ?? new Set();
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
            ...(fn.isVariadic ? { isVariadic: true } : {}),
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
        ...(globalDecl.isStatic ? { isStatic: true } : {}),
        ...(globalDecl.isExtern ? { isExtern: true } : {}),
        initializer: globalDecl.initializer,
    };
}
function analyzeFunction(fn, globals, functionSymbols, sourceText, file) {
    const functionScope = { entries: new Map(), ...(fn.isVariadic ? { isVariadicFunction: true, fixedParamCount: fn.params.length } : {}) };
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
    const body = analyzeBlock(fn.body, functionScope, allLocals, localList, globals, functionSymbols, fn.name, sourceText, file, 0);
    return {
        kind: "boundFunction",
        name: fn.name,
        ...(fn.isStatic ? { isStatic: true } : {}),
        ...(fn.isVariadic ? { isVariadic: true } : {}),
        returnType: toSemanticType(fn.returnType),
        params,
        locals: localList,
        body,
    };
}
function analyzeBlock(block, parentScope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth = 0, breakDepth = 0, controlNesting = 0) {
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
        if (declaration.isStatic) {
            if (declaration.initializer && !isStaticStorageInitializer(declaration.initializer)) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset requires a static-data initializer for static local '${declaration.name}' in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            const symbol = {
                kind: "global",
                name: `__scc_static_${functionName}_${globals.length}`,
                type: toSemanticType(declaration.type),
                initializer: declaration.initializer,
            };
            globals.push(symbol);
            scope.entries.set(declaration.name, symbol);
            continue;
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
        statements: block.statements.map((stmt) => analyzeStmt(stmt, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth, controlNesting)),
    };
}
function isStaticStorageInitializer(initializer) {
    if (initializer.kind === "list") {
        return initializer.items.every((item) => isStaticStorageInitializer(item));
    }
    switch (initializer.expr.kind) {
        case "const":
        case "string":
        case "vaStart":
        case "vaArg":
        case "vaEnd":
        case "addressOf":
            return true;
        default:
            return false;
    }
}
function analyzeStmt(stmt, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth = 0, breakDepth = 0, controlNesting = 0) {
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
                        ? analyzeAggregateProducerExpr(stmt.expr, scope, functionSymbols, fnSymbol.returnType, functionName, sourceText, file)
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
        case "expr": {
            if (stmt.expr.kind === "derefAssign") {
                try {
                    const target = getAggregateBasePointerFromExpr(stmt.expr.target, scope, functionSymbols, functionName, sourceText, file);
                    return {
                        kind: "aggregateAssign",
                        target: { kind: "aggregateAddress", pointer: target.pointer, type: target.type },
                        source: analyzeAggregateProducerExpr(stmt.expr.expr, scope, functionSymbols, target.type, functionName, sourceText, file),
                    };
                }
                catch {
                    // Scalar dereference assignments continue through the normal expression path.
                }
            }
            return { kind: "expr", expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file) };
        }
        case "if":
            assertControlNesting(controlNesting + 1, functionName, sourceText, file);
            return {
                kind: "if",
                condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
                thenBlock: analyzeBlock(stmt.thenBlock, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth, controlNesting + 1),
                elseBlock: stmt.elseBlock
                    ? analyzeBlock(stmt.elseBlock, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth, controlNesting + 1)
                    : undefined,
            };
        case "while":
            assertControlNesting(controlNesting + 1, functionName, sourceText, file);
            return {
                kind: "while",
                condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
                body: analyzeBlock(stmt.body, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth + 1, breakDepth + 1, controlNesting + 1),
            };
        case "doWhile":
            assertControlNesting(controlNesting + 1, functionName, sourceText, file);
            return {
                kind: "doWhile",
                body: analyzeBlock(stmt.body, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth + 1, breakDepth + 1, controlNesting + 1),
                condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
            };
        case "for":
            {
                assertControlNesting(controlNesting + 1, functionName, sourceText, file);
                const forScope = { parent: scope, entries: new Map() };
                let initializer;
                if (stmt.initializer) {
                    initializer = analyzeForInitializer(stmt.initializer, forScope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file);
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
                    body: analyzeBlock(stmt.body, forScope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth + 1, breakDepth + 1, controlNesting + 1),
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
                    body: analyzeBlock(entry.body, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth + 1, controlNesting + 1),
                })),
                defaultCase: stmt.defaultCase
                    ? analyzeBlock(stmt.defaultCase, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth + 1, controlNesting + 1)
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
            if (!stmt.isInitialization) {
                assertModifiableType(symbol.type, `object '${stmt.name}'`, functionName, sourceText, file);
            }
            if (symbol.kind === "global") {
                if (symbol.type.kind === "aggregate") {
                    return analyzeAggregateAssignStmt(symbol, stmt.expr, scope, functionSymbols, functionName, sourceText, file, stmt.isInitialization);
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
                return analyzeAggregateAssignStmt(symbol, stmt.expr, scope, functionSymbols, functionName, sourceText, file, stmt.isInitialization);
            }
            return {
                kind: "assign",
                local: symbol,
                expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
            };
        }
        case "arrayAssign":
            return analyzeIndexedAssignStmt(stmt.name, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file, stmt.isInitialization);
        case "memberAssign": {
            const aggregateAssign = analyzeDirectAggregateFieldAssignStmt(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
            if (aggregateAssign) {
                return aggregateAssign;
            }
            return {
                kind: "expr",
                expr: analyzeAggregateFieldAssignExpr(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file, stmt.isInitialization),
            };
        }
        case "memberExprAssign": {
            const aggregateAssign = analyzeAggregateFieldAssignStmtTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
            if (aggregateAssign) {
                return aggregateAssign;
            }
            return {
                kind: "expr",
                expr: analyzeAggregateFieldAssignExprTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file, stmt.isInitialization),
            };
        }
        case "memberArrayAssign":
            return {
                kind: "expr",
                expr: analyzeAggregateArrayFieldAssignExprTarget(stmt.target, stmt.field, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
            };
        case "pointerMemberArrayAssign":
            return {
                kind: "expr",
                expr: analyzePointerAggregateArrayFieldAssignExpr(stmt.name, stmt.field, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
            };
        case "pointerMemberAssign": {
            const aggregateAssign = analyzePointerAggregateFieldAssignStmt({ kind: "ref", name: stmt.name }, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
            if (aggregateAssign) {
                return aggregateAssign;
            }
            return {
                kind: "expr",
                expr: analyzePointerAggregateFieldAssignExpr(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
            };
        }
        case "pointerMemberExprAssign": {
            const aggregateAssign = analyzePointerAggregateFieldAssignStmt(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
            if (aggregateAssign) {
                return aggregateAssign;
            }
            return {
                kind: "expr",
                expr: analyzePointerAggregateFieldAssignExprTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
            };
        }
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
    if (stmt.kind === "memberArrayAssign") {
        return {
            kind: "expr",
            expr: analyzeAggregateArrayFieldAssignExprTarget(stmt.target, stmt.field, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
        };
    }
    if (stmt.kind === "pointerMemberArrayAssign") {
        return {
            kind: "expr",
            expr: analyzePointerAggregateArrayFieldAssignExpr(stmt.name, stmt.field, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
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
    assertModifiableType(symbol.type, `object '${stmt.name}'`, functionName, sourceText, file);
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
function analyzeAggregateAssignStmt(target, expr, scope, functionSymbols, functionName, sourceText, file, isInitialization = false) {
    if (!isInitialization) {
        assertModifiableType(target.type, `aggregate object '${target.name}'`, functionName, sourceText, file);
    }
    const source = analyzeAggregateProducerExpr(expr, scope, functionSymbols, target.type, functionName, sourceText, file);
    return {
        kind: "aggregateAssign",
        target,
        source,
    };
}
function analyzeAggregateAssignSimpleStmt(target, expr, scope, functionSymbols, functionName, sourceText, file) {
    const source = analyzeAggregateProducerExpr(expr, scope, functionSymbols, target.type, functionName, sourceText, file);
    return {
        kind: "aggregateAssign",
        target,
        source,
    };
}
function analyzeAggregateProducerExpr(expr, scope, functionSymbols, targetType, functionName, sourceText, file) {
    switch (expr.kind) {
        case "arrayIndex":
        case "arrayPointerElement": {
            const target = getAggregateBasePointerFromExpr(expr, scope, functionSymbols, functionName, sourceText, file);
            if (targetType) {
                assertMatchingAggregateType(target.type, targetType, functionName, sourceText, file);
            }
            return { kind: "aggregateAddress", pointer: target.pointer, type: target.type };
        }
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
            assertModifiableType(aggregateTarget.type, `aggregate object '${aggregateTarget.name}'`, functionName, sourceText, file);
            const source = analyzeAggregateProducerExpr(expr.expr, scope, functionSymbols, aggregateTarget.type, functionName, sourceText, file);
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
        case "arrayAssign": {
            const symbol = lookupVisible(scope, expr.name);
            if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "array" || symbol.type.elementValueType?.kind !== "aggregate") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset expected an aggregate array assignment expression in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            assertModifiableArrayElement(symbol.type, `array element '${expr.name}[...]'`, functionName, sourceText, file);
            return analyzeAggregateAssignExprToAddress({ kind: "arrayIndex", name: expr.name, index: expr.index }, expr.expr, scope, functionSymbols, targetType, functionName, sourceText, file);
        }
        case "memberAssign":
            return analyzeAggregateAssignExprToAddress({ kind: "memberAccess", name: expr.name, field: expr.field }, expr.expr, scope, functionSymbols, targetType, functionName, sourceText, file);
        case "memberExprAssign":
            return analyzeAggregateAssignExprToAddress({ kind: "memberExprAccess", target: expr.target, field: expr.field }, expr.expr, scope, functionSymbols, targetType, functionName, sourceText, file);
        case "pointerMemberAssign":
            return analyzeAggregateAssignExprToAddress({ kind: "pointerMemberAccess", name: expr.name, field: expr.field }, expr.expr, scope, functionSymbols, targetType, functionName, sourceText, file);
        case "pointerMemberExprAssign":
            return analyzeAggregateAssignExprToAddress({ kind: "pointerMemberExprAccess", target: expr.target, field: expr.field }, expr.expr, scope, functionSymbols, targetType, functionName, sourceText, file);
        case "derefAssign":
            return analyzeAggregateAssignExprToAddress(expr.target, expr.expr, scope, functionSymbols, targetType, functionName, sourceText, file);
        case "comma":
            {
                const right = analyzeAggregateProducerExpr(expr.right, scope, functionSymbols, targetType, functionName, sourceText, file);
                return {
                    kind: "comma",
                    left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
                    right,
                    type: right.type,
                };
            }
        case "conditional": {
            const thenExpr = analyzeAggregateProducerExpr(expr.thenExpr, scope, functionSymbols, targetType, functionName, sourceText, file);
            const elseExpr = analyzeAggregateProducerExpr(expr.elseExpr, scope, functionSymbols, thenExpr.type, functionName, sourceText, file);
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
            if (target.isVariadic ? expr.args.length < target.params.length : target.params.length !== expr.args.length) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset expected ${target.params.length} argument(s) for ${expr.target}(), got ${expr.args.length}.`, { file, offset: 0 });
            }
            if (targetType) {
                assertMatchingAggregateType(target.returnType, targetType, functionName, sourceText, file);
            }
            return {
                kind: "call",
                target,
                args: expr.args.map((arg, index) => analyzeCallArg(arg, target.params[index], scope, functionSymbols, functionName, sourceText, file)),
                type: target.returnType,
            };
        }
        case "indirectCall": {
            const target = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
            if (target.type.kind !== "functionPointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value calls through aggregate-returning function pointers in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            const signature = target.type;
            const returnType = signature.returnType;
            if (returnType.kind !== "aggregate") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value calls through aggregate-returning function pointers in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            if (signature.isVariadic ? expr.args.length < signature.params.length : signature.params.length !== expr.args.length) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset expected ${signature.params.length} argument(s) for indirect aggregate call, got ${expr.args.length}.`, {
                    file,
                    offset: 0,
                });
            }
            if (targetType) {
                assertMatchingAggregateType(returnType, targetType, functionName, sourceText, file);
            }
            return {
                kind: "indirectCall",
                target,
                signature,
                args: expr.args.map((arg, index) => analyzeCallArg(arg, signature.params[index], scope, functionSymbols, functionName, sourceText, file)),
                type: returnType,
            };
        }
        default:
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value expressions from local/parameter/global aggregate symbols in ${functionName}().`, {
                file,
                offset: 0,
            });
    }
}
function analyzeAggregateAssignExprToAddress(targetExpr, sourceExpr, scope, functionSymbols, expectedType, functionName, sourceText, file) {
    const target = getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    assertModifiableType(target.type, "aggregate object", functionName, sourceText, file);
    const source = analyzeAggregateProducerExpr(sourceExpr, scope, functionSymbols, target.type, functionName, sourceText, file);
    if (expectedType) {
        assertMatchingAggregateType(target.type, expectedType, functionName, sourceText, file);
    }
    return {
        kind: "aggregateAssignExpr",
        target: { kind: "aggregateAddress", pointer: target.pointer, type: target.type },
        source,
        type: target.type,
    };
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
function analyzeArrayAssignStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file, isInitialization = false) {
    const symbol = lookupVisible(scope, name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || symbol.type.kind !== "array") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local/parameter char arrays, got '${name}[...]'.`, {
            file,
            offset: 0,
        });
    }
    if (!isInitialization) {
        assertModifiableArrayElement(symbol.type, `array element '${name}[...]'`, functionName, sourceText, file);
    }
    const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
    if (symbol.kind === "local") {
        assertArrayIndexInBounds(boundIndex, name, getSizedArrayLength(symbol.type), functionName, sourceText, file);
    }
    if (symbol.type.elementValueType) {
        if (symbol.type.elementValueType.kind === "aggregate") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset requires aggregate array assignments to be used as statements in ${functionName}().`, { file, offset: 0 });
        }
        const elementPointee = toArrayElementPointee(symbol.type);
        return {
            kind: "expr",
            expr: {
                kind: "derefAssign",
                pointer: {
                    kind: "pointerAdd",
                    pointer: symbol.kind === "local"
                        ? { kind: "localAddress", symbol, type: toSemanticPointerType(elementPointee) }
                        : { kind: "ref", symbol, type: toSemanticPointerType(elementPointee) },
                    index: boundIndex,
                    pointee: elementPointee,
                    type: toSemanticPointerType(elementPointee),
                },
                expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
                type: getArrayElementValueType(symbol.type),
            },
        };
    }
    if (symbol.type.elementType === "int") {
        return {
            kind: "expr",
            expr: {
                kind: "derefAssign",
                pointer: makeArrayElementPointer(symbol, boundIndex),
                expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
                type: toSemanticScalarType("int"),
            },
        };
    }
    return {
        kind: "arrayAssign",
        target: symbol,
        index: boundIndex,
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
    };
}
function analyzeIndexedAssignStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file, isInitialization = false) {
    const symbol = lookupVisible(scope, name);
    if (symbol && symbol.kind === "global" && symbol.type.kind === "array") {
        if (!isInitialization) {
            assertModifiableArrayElement(symbol.type, `array element '${name}[...]'`, functionName, sourceText, file);
        }
        const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
        if (symbol.type.elementValueType) {
            if (symbol.type.elementValueType.kind === "aggregate") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset requires aggregate array assignments to be used as statements in ${functionName}().`, { file, offset: 0 });
            }
            const elementPointee = toArrayElementPointee(symbol.type);
            return {
                kind: "expr",
                expr: {
                    kind: "derefAssign",
                    pointer: {
                        kind: "pointerAdd",
                        pointer: { kind: "globalAddress", symbol, type: toSemanticPointerType(elementPointee) },
                        index: boundIndex,
                        pointee: elementPointee,
                        type: toSemanticPointerType(elementPointee),
                    },
                    expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
                    type: getArrayElementValueType(symbol.type),
                },
            };
        }
        if (symbol.type.elementType === "int") {
            return {
                kind: "expr",
                expr: {
                    kind: "derefAssign",
                    pointer: makeArrayElementPointer(symbol, boundIndex),
                    expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
                    type: toSemanticScalarType("int"),
                },
            };
        }
        return {
            kind: "expr",
            expr: {
                kind: "globalArrayAssignExpr",
                target: symbol,
                index: boundIndex,
                expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
                type: toSemanticScalarType("char"),
            },
        };
    }
    if (symbol && (symbol.kind === "local" || symbol.kind === "param") && symbol.type.kind === "pointer") {
        assertModifiablePointee(symbol.type, `pointee of '${name}'`, functionName, sourceText, file);
        return {
            kind: "expr",
            expr: analyzePointerIndexedAssignExpr(symbol, index, expr, scope, functionSymbols, functionName, sourceText, file),
        };
    }
    return analyzeArrayAssignStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file, isInitialization);
}
function analyzeIndexedAssignSimpleStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file) {
    const symbol = lookupVisible(scope, name);
    if (symbol && symbol.kind === "global" && symbol.type.kind === "array") {
        assertModifiableArrayElement(symbol.type, `array element '${name}[...]'`, functionName, sourceText, file);
        const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
        if (symbol.type.elementType === "int") {
            return {
                kind: "expr",
                expr: {
                    kind: "derefAssign",
                    pointer: makeArrayElementPointer(symbol, boundIndex),
                    expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
                    type: toSemanticScalarType("int"),
                },
            };
        }
        return {
            kind: "expr",
            expr: {
                kind: "globalArrayAssignExpr",
                target: symbol,
                index: boundIndex,
                expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
                type: toSemanticScalarType("char"),
            },
        };
    }
    if (symbol && (symbol.kind === "local" || symbol.kind === "param") && symbol.type.kind === "pointer") {
        assertModifiablePointee(symbol.type, `pointee of '${name}'`, functionName, sourceText, file);
        return {
            kind: "expr",
            expr: analyzePointerIndexedAssignExpr(symbol, index, expr, scope, functionSymbols, functionName, sourceText, file),
        };
    }
    return analyzeArrayAssignStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file);
}
function makeArrayElementPointer(symbol, index) {
    if (symbol.type.kind !== "array") {
        throw new Error(`Expected array symbol, got ${JSON.stringify(symbol.type)}.`);
    }
    const pointee = getArrayDecayPointee(symbol.type);
    const pointer = symbol.kind === "global"
        ? { kind: "globalAddress", symbol, type: toSemanticPointerType(pointee) }
        : symbol.kind === "local"
            ? { kind: "localAddress", symbol, type: toSemanticPointerType(pointee) }
            : { kind: "ref", symbol, type: toSemanticPointerType(pointee) };
    return {
        kind: "pointerAdd",
        pointer,
        index,
        pointee,
        type: toSemanticPointerType(pointee),
    };
}
function analyzePointerIndexedAssignExpr(symbol, index, expr, scope, functionSymbols, functionName, sourceText, file) {
    if (symbol.type.kind !== "pointer") {
        throw new Error("Internal semantic error: expected pointer symbol.");
    }
    assertModifiablePointee(symbol.type, `pointee of '${symbol.name}'`, functionName, sourceText, file);
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
function analyzeAggregateFieldAssignExpr(name, fieldName, expr, scope, functionSymbols, functionName, sourceText, file, isInitialization = false) {
    const symbol = lookupVisible(scope, name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports member assignment on local/global struct/union objects, got '${name}.${fieldName}'.`, {
            file,
            offset: 0,
        });
    }
    const field = getAssignableAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file, isInitialization);
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
function analyzeDirectAggregateFieldAssignStmt(name, fieldName, expr, scope, functionSymbols, functionName, sourceText, file) {
    const symbol = lookupVisible(scope, name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
        return undefined;
    }
    const field = getAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file);
    if (field.type.kind !== "aggregate") {
        return undefined;
    }
    const fieldType = toSemanticType(field.type);
    return {
        kind: "aggregateAssign",
        target: {
            kind: "aggregateAddress",
            pointer: {
                kind: "pointerAdd",
                pointer: getAggregateStorageAddress(symbol, symbol.type),
                index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                pointee: { kind: "aggregate", aggregateKind: fieldType.aggregateKind, name: fieldType.name },
                type: toSemanticPointerType({ kind: "aggregate", aggregateKind: fieldType.aggregateKind, name: fieldType.name }),
            },
            type: fieldType,
        },
        source: analyzeAggregateProducerExpr(expr, scope, functionSymbols, fieldType, functionName, sourceText, file),
    };
}
function analyzeAggregateFieldAssignStmtTarget(targetExpr, fieldName, expr, scope, functionSymbols, functionName, sourceText, file) {
    const baseTarget = getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    return analyzeAggregateFieldAssignFromBase(baseTarget.pointer, baseTarget.type, fieldName, expr, scope, functionSymbols, functionName, sourceText, file);
}
function analyzePointerAggregateFieldAssignStmt(targetExpr, fieldName, expr, scope, functionSymbols, functionName, sourceText, file) {
    const pointer = analyzeExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
    const aggregateType = toSemanticType({
        kind: "aggregate",
        aggregateKind: aggregatePointee.aggregateKind,
        name: aggregatePointee.name,
    });
    return analyzeAggregateFieldAssignFromBase(pointer, aggregateType, fieldName, expr, scope, functionSymbols, functionName, sourceText, file);
}
function analyzeAggregateFieldAssignFromBase(basePointer, baseType, fieldName, expr, scope, functionSymbols, functionName, sourceText, file) {
    const field = getAggregateFieldLayout(baseType, fieldName, functionName, sourceText, file);
    if (field.type.kind !== "aggregate") {
        return undefined;
    }
    const fieldType = toSemanticType(field.type);
    return {
        kind: "aggregateAssign",
        target: {
            kind: "aggregateAddress",
            pointer: {
                kind: "pointerAdd",
                pointer: basePointer,
                index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                pointee: { kind: "aggregate", aggregateKind: fieldType.aggregateKind, name: fieldType.name },
                type: toSemanticPointerType({ kind: "aggregate", aggregateKind: fieldType.aggregateKind, name: fieldType.name }),
            },
            type: fieldType,
        },
        source: analyzeAggregateProducerExpr(expr, scope, functionSymbols, fieldType, functionName, sourceText, file),
    };
}
function analyzePointerAggregateFieldAssignExpr(name, fieldName, expr, scope, functionSymbols, functionName, sourceText, file) {
    const symbol = lookupVisible(scope, name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || symbol.type.kind !== "pointer") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers, got '${name}->${fieldName}' in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    const aggregatePointee = getAggregatePointerPointee(symbol.type, functionName, sourceText, file);
    const field = getAssignableAggregateFieldLayout(toSemanticType({
        kind: "aggregate",
        aggregateKind: aggregatePointee.aggregateKind,
        name: aggregatePointee.name,
        ...(hasTypeQualifiers(aggregatePointee.qualifiers) ? { qualifiers: aggregatePointee.qualifiers } : {}),
    }), fieldName, functionName, sourceText, file);
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
function analyzeAggregateFieldAssignExprTarget(targetExpr, fieldName, expr, scope, functionSymbols, functionName, sourceText, file, isInitialization = false) {
    const target = isInitialization
        ? (() => {
            const base = getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
            const field = getReadableAggregateFieldLayout(base.type, fieldName, functionName, sourceText, file);
            return {
                pointer: {
                    kind: "pointerAdd",
                    pointer: base.pointer,
                    index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                    pointee: "char",
                    type: toSemanticPointerType("char"),
                },
                type: field.type,
            };
        })()
        : getAggregateFieldAssignablePointerFromTargetExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file);
    return {
        kind: "derefAssign",
        pointer: target.pointer,
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
        type: target.type,
    };
}
function analyzeAggregateArrayFieldAssignExprTarget(targetExpr, fieldName, index, expr, scope, functionSymbols, functionName, sourceText, file) {
    const baseTarget = getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    const field = getAggregateFieldLayout(baseTarget.type, fieldName, functionName, sourceText, file);
    if (field.type.kind !== "array") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports array field assignment on ${baseTarget.type.aggregateKind} ${baseTarget.type.name}.${fieldName} in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
    if (field.type.length !== undefined) {
        assertArrayIndexInBounds(boundIndex, `${baseTarget.type.name}.${fieldName}`, field.type.length, functionName, sourceText, file);
    }
    return {
        kind: "derefAssign",
        pointer: {
            kind: "pointerAdd",
            pointer: {
                kind: "pointerAdd",
                pointer: baseTarget.pointer,
                index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                // Aggregate field offsets are byte offsets; only the array index uses the element stride.
                pointee: "char",
                type: toSemanticPointerType("char"),
            },
            index: boundIndex,
            pointee: field.type.elementType,
            type: toSemanticPointerType(field.type.elementType),
        },
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
        type: toSemanticScalarType(field.type.elementType),
    };
}
function analyzeAggregateArrayFieldIndexExpr(name, fieldName, index, scope, functionSymbols, functionName, sourceText, file) {
    const symbol = lookupVisible(scope, name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate array-field access on local/global struct/union objects, got '${name}.${fieldName}[...]'.`, {
            file,
            offset: 0,
        });
    }
    const field = getAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file);
    if (field.type.kind !== "array") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports array field access on ${symbol.type.aggregateKind} ${symbol.type.name}.${fieldName} in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
    if (field.type.length !== undefined) {
        assertArrayIndexInBounds(boundIndex, `${symbol.type.name}.${fieldName}`, field.type.length, functionName, sourceText, file);
    }
    return {
        kind: "deref",
        pointer: {
            kind: "pointerAdd",
            pointer: {
                kind: "pointerAdd",
                pointer: symbol.kind === "param"
                    ? {
                        kind: "ref",
                        symbol,
                        type: toSemanticPointerType({ kind: "aggregate", aggregateKind: symbol.type.aggregateKind, name: symbol.type.name }),
                    }
                    : getAggregateStorageAddress(symbol, symbol.type),
                index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                pointee: "char",
                type: toSemanticPointerType("char"),
            },
            index: boundIndex,
            pointee: field.type.elementType,
            type: toSemanticPointerType(field.type.elementType),
        },
        type: toSemanticScalarType(field.type.elementType),
    };
}
function analyzeAggregateArrayFieldIndexExprTarget(targetExpr, fieldName, index, scope, functionSymbols, functionName, sourceText, file) {
    if (!isAggregateStorageExpr(targetExpr)) {
        const producerTarget = resolveAggregateProducerFieldTarget(targetExpr, scope, functionSymbols, functionName, sourceText, file);
        const field = getAggregateFieldLayout(producerTarget.type, fieldName, functionName, sourceText, file);
        if (field.type.kind !== "array") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports array field access on ${producerTarget.type.aggregateKind} ${producerTarget.type.name}.${fieldName} in ${functionName}().`, { file, offset: 0 });
        }
        const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
        if (field.type.length !== undefined) {
            assertArrayIndexInBounds(boundIndex, `${producerTarget.type.name}.${fieldName}`, field.type.length, functionName, sourceText, file);
        }
        return {
            kind: "deref",
            pointer: {
                kind: "pointerAdd",
                pointer: {
                    kind: "aggregateProducerFieldAddress",
                    source: producerTarget.source,
                    offset: producerTarget.offset + field.offset,
                    type: toSemanticPointerType("char"),
                },
                index: boundIndex,
                pointee: field.type.elementType,
                type: toSemanticPointerType(field.type.elementType),
            },
            type: toSemanticScalarType(field.type.elementType),
        };
    }
    const baseTarget = getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    const field = getAggregateFieldLayout(baseTarget.type, fieldName, functionName, sourceText, file);
    if (field.type.kind !== "array") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports array field access on ${baseTarget.type.aggregateKind} ${baseTarget.type.name}.${fieldName} in ${functionName}().`, { file, offset: 0 });
    }
    const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
    if (field.type.length !== undefined) {
        assertArrayIndexInBounds(boundIndex, `${baseTarget.type.name}.${fieldName}`, field.type.length, functionName, sourceText, file);
    }
    return {
        kind: "deref",
        pointer: {
            kind: "pointerAdd",
            pointer: {
                kind: "pointerAdd",
                pointer: baseTarget.pointer,
                index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                pointee: "char",
                type: toSemanticPointerType("char"),
            },
            index: boundIndex,
            pointee: field.type.elementType,
            type: toSemanticPointerType(field.type.elementType),
        },
        type: toSemanticScalarType(field.type.elementType),
    };
}
function isAggregateStorageExpr(expr) {
    switch (expr.kind) {
        case "ref":
        case "deref":
        case "memberAccess":
        case "pointerMemberAccess":
        case "pointerMemberExprAccess":
        case "arrayPointerElement":
        case "arrayIndex":
            return true;
        case "memberExprAccess":
            return isAggregateStorageExpr(expr.target);
        default:
            return false;
    }
}
function resolveAggregateProducerFieldTarget(targetExpr, scope, functionSymbols, functionName, sourceText, file) {
    if (targetExpr.kind === "memberExprAccess") {
        const parent = resolveAggregateProducerFieldTarget(targetExpr.target, scope, functionSymbols, functionName, sourceText, file);
        const field = getAggregateFieldLayout(parent.type, targetExpr.field, functionName, sourceText, file);
        if (field.type.kind !== "aggregate") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports producer field chaining through aggregate fields in ${functionName}().`, { file, offset: 0 });
        }
        return {
            source: parent.source,
            type: toSemanticType(field.type),
            offset: parent.offset + field.offset,
        };
    }
    const source = analyzeAggregateProducerExpr(targetExpr, scope, functionSymbols, undefined, functionName, sourceText, file);
    return { source, type: source.type, offset: 0 };
}
function getAggregateFieldLayoutForConsumerTarget(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file) {
    const type = isAggregateStorageExpr(targetExpr)
        ? getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file).type
        : resolveAggregateProducerFieldTarget(targetExpr, scope, functionSymbols, functionName, sourceText, file).type;
    return getAggregateFieldLayout(type, fieldName, functionName, sourceText, file);
}
function getArrayFieldAddressFromConsumerExpr(expr, scope, functionSymbols, functionName, sourceText, file) {
    // An array field decays exactly like a named array.  In particular, retain
    // every trailing bound so `field[M][N][O]` produces `T (*)[N][O]`, rather
    // than the former one-dimensional descriptor.
    const arrayPointerType = (type) => toSemanticPointerType(getArrayDecayPointee(type));
    const makeAddress = (pointer, field) => ({
        kind: "pointerAdd",
        pointer,
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: "char",
        type: arrayPointerType(field.type),
    });
    if (expr.kind === "pointerMemberAccess" || expr.kind === "pointerMemberExprAccess") {
        const pointer = expr.kind === "pointerMemberAccess"
            ? analyzeExpr({ kind: "ref", name: expr.name }, scope, functionSymbols, functionName, sourceText, file)
            : analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
        const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
        const aggregateType = toSemanticType({
            kind: "aggregate",
            aggregateKind: aggregatePointee.aggregateKind,
            name: aggregatePointee.name,
        });
        const field = getAggregateFieldLayout(aggregateType, expr.field, functionName, sourceText, file);
        return field.type.kind === "array" && field.type.length !== undefined ? makeAddress(pointer, field) : null;
    }
    const baseExpr = expr.kind === "memberAccess"
        ? { kind: "ref", name: expr.name }
        : expr.target;
    if (isAggregateStorageExpr(baseExpr)) {
        const base = getAggregateBasePointerFromExpr(baseExpr, scope, functionSymbols, functionName, sourceText, file);
        const field = getAggregateFieldLayout(base.type, expr.field, functionName, sourceText, file);
        return field.type.kind === "array" && field.type.length !== undefined ? makeAddress(base.pointer, field) : null;
    }
    const producer = resolveAggregateProducerFieldTarget(baseExpr, scope, functionSymbols, functionName, sourceText, file);
    const field = getAggregateFieldLayout(producer.type, expr.field, functionName, sourceText, file);
    if (field.type.kind !== "array" || field.type.length === undefined) {
        return null;
    }
    return {
        kind: "aggregateProducerFieldAddress",
        source: producer.source,
        offset: producer.offset + field.offset,
        type: arrayPointerType(toSemanticType(field.type)),
    };
}
function analyzePointerAggregateArrayFieldIndexExpr(name, fieldName, index, scope, functionSymbols, functionName, sourceText, file) {
    const symbol = lookupVisible(scope, name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "pointer") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers, got '${name}->${fieldName}[...]' in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    const aggregatePointee = getAggregatePointerPointee(symbol.type, functionName, sourceText, file);
    const field = getAggregateFieldLayout(toSemanticType({
        kind: "aggregate",
        aggregateKind: aggregatePointee.aggregateKind,
        name: aggregatePointee.name,
    }), fieldName, functionName, sourceText, file);
    if (field.type.kind !== "array") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports array field access on ${aggregatePointee.aggregateKind} ${aggregatePointee.name}->${fieldName} in ${functionName}().`, {
            file,
            offset: 0,
        });
    }
    const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
    if (field.type.length !== undefined) {
        assertArrayIndexInBounds(boundIndex, `${aggregatePointee.name}.${fieldName}`, field.type.length, functionName, sourceText, file);
    }
    return {
        kind: "deref",
        pointer: {
            kind: "pointerAdd",
            pointer: {
                kind: "pointerAdd",
                pointer: symbol.kind === "global"
                    ? { kind: "globalRef", symbol, type: symbol.type }
                    : { kind: "ref", symbol, type: symbol.type },
                index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                pointee: "char",
                type: toSemanticPointerType("char"),
            },
            index: boundIndex,
            pointee: field.type.elementType,
            type: toSemanticPointerType(field.type.elementType),
        },
        type: toSemanticScalarType(field.type.elementType),
    };
}
function analyzePointerAggregateArrayFieldIndexExprTarget(targetExpr, fieldName, index, scope, functionSymbols, functionName, sourceText, file) {
    const pointer = analyzeExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
    const field = getAggregateFieldLayout(toSemanticType({ kind: "aggregate", aggregateKind: aggregatePointee.aggregateKind, name: aggregatePointee.name }), fieldName, functionName, sourceText, file);
    if (field.type.kind !== "array") {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports array field access on ${aggregatePointee.aggregateKind} ${aggregatePointee.name}->${fieldName} in ${functionName}().`, { file, offset: 0 });
    }
    const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
    if (field.type.length !== undefined) {
        assertArrayIndexInBounds(boundIndex, `${aggregatePointee.name}.${fieldName}`, field.type.length, functionName, sourceText, file);
    }
    return {
        kind: "deref",
        pointer: {
            kind: "pointerAdd",
            pointer: {
                kind: "pointerAdd",
                pointer,
                index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                pointee: "char",
                type: toSemanticPointerType("char"),
            },
            index: boundIndex,
            pointee: field.type.elementType,
            type: toSemanticPointerType(field.type.elementType),
        },
        type: toSemanticScalarType(field.type.elementType),
    };
}
function analyzePointerAggregateArrayFieldAssignExpr(name, fieldName, index, expr, scope, functionSymbols, functionName, sourceText, file) {
    const target = analyzePointerAggregateArrayFieldIndexExpr(name, fieldName, index, scope, functionSymbols, functionName, sourceText, file);
    return {
        kind: "derefAssign",
        pointer: target.pointer,
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
        type: target.type,
    };
}
function analyzePointerAggregateFieldAssignExprTarget(targetExpr, fieldName, expr, scope, functionSymbols, functionName, sourceText, file) {
    const pointer = analyzeExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
    const field = getAssignableAggregateFieldLayout(toSemanticType({
        kind: "aggregate",
        aggregateKind: aggregatePointee.aggregateKind,
        name: aggregatePointee.name,
    }), fieldName, functionName, sourceText, file);
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
    if (targetExpr.kind === "arrayPointerElement" || targetExpr.kind === "arrayIndex") {
        const target = getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
        const field = getScalarAggregateFieldLayout(target.type, fieldName, functionName, sourceText, file);
        return {
            pointer: { kind: "pointerAdd", pointer: target.pointer, index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") }, pointee: "char", type: toSemanticPointerType("char") },
            type: field.type,
        };
    }
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
function getAggregateFieldAssignablePointerFromTargetExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file) {
    if (targetExpr.kind === "arrayPointerElement" || targetExpr.kind === "arrayIndex") {
        const target = getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
        const field = getAssignableAggregateFieldLayout(target.type, fieldName, functionName, sourceText, file);
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
    if (targetExpr.kind === "memberAccess"
        || targetExpr.kind === "memberExprAccess"
        || targetExpr.kind === "pointerMemberAccess"
        || targetExpr.kind === "pointerMemberExprAccess") {
        const target = getAggregateObjectPointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
        const field = getAssignableAggregateFieldLayout(target.type, fieldName, functionName, sourceText, file);
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
        const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
        const field = getAssignableAggregateFieldLayout(toSemanticType({
            kind: "aggregate",
            aggregateKind: aggregatePointee.aggregateKind,
            name: aggregatePointee.name,
        }), fieldName, functionName, sourceText, file);
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
        const symbol = lookupVisible(scope, targetExpr.name);
        if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate field assignment on local/global struct/union objects, got '${targetExpr.name}.${fieldName}'.`, {
                file,
                offset: 0,
            });
        }
        const field = getAssignableAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file);
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
    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports '.' assignment on local aggregates or dereferenced struct/union pointers in ${functionName}().`, {
        file,
        offset: 0,
    });
}
function getAggregateFieldReadFromTargetExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file) {
    if (isAggregateStorageExpr(targetExpr)) {
        const target = getAggregateFieldPointerFromTargetExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file);
        return {
            kind: "pointer",
            pointer: target.pointer,
            type: target.type,
        };
    }
    return {
        kind: "value",
        expr: analyzeAggregateProducerFieldReadExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file),
    };
}
function analyzeAggregateProducerFieldReadExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file) {
    const target = resolveAggregateProducerFieldTarget(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    return lowerAggregateProducerFieldReadExpr(target.source, fieldName, functionName, sourceText, file, target.offset, target.type);
}
function lowerAggregateProducerFieldReadExpr(expr, fieldName, functionName, sourceText, file, baseOffset = 0, aggregateType = expr.type) {
    const field = getReadableAggregateFieldLayout(aggregateType, fieldName, functionName, sourceText, file);
    return {
        kind: "aggregateProducerFieldRead",
        source: expr,
        offset: baseOffset + field.offset,
        type: field.type,
    };
}
function analyzeForInitializer(init, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file) {
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
    if (init.isStatic) {
        if (init.initializer && !isStaticStorageInitializer(init.initializer)) {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset requires a static-data initializer for static local '${init.name}' in ${functionName}().`, {
                file,
                offset: 0,
            });
        }
        const symbol = {
            kind: "global",
            name: `__scc_static_${functionName}_${globals.length}`,
            type: toSemanticType(init.type),
            initializer: init.initializer,
        };
        globals.push(symbol);
        scope.entries.set(init.name, symbol);
        return { kind: "staticDecl" };
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
                ? symbol.type.kind === "aggregate"
                    ? analyzeAggregateProducerExpr(init.initializer.expr, scope, functionSymbols, symbol.type, functionName, sourceText, file)
                    : analyzeExpr(init.initializer.expr, scope, functionSymbols, functionName, sourceText, file)
                : undefined
            : undefined,
        initStatements: init.initStatements?.map((stmt) => analyzeSimpleStmt(stmt, scope, functionSymbols, functionName, sourceText, file)),
    };
}
function analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file) {
    switch (expr.kind) {
        case "const":
            return { kind: "const", value: expr.value, type: toSemanticScalarType("int") };
        case "string":
            return { kind: "string", value: expr.value, type: toSemanticScalarType("int") };
        case "vaStart": {
            const list = lookupVisible(scope, expr.list);
            const lastFixed = lookupVisible(scope, expr.lastFixed);
            if (!list || list.kind !== "local" || list.type.kind !== "pointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset requires va_start() to receive a local va_list in ${functionName}().`, { file, offset: 0 });
            }
            if (!lastFixed || lastFixed.kind !== "param") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset requires va_start() to name a fixed parameter in ${functionName}().`, { file, offset: 0 });
            }
            const variadicScope = getVariadicFunctionScope(scope);
            if (!variadicScope || lastFixed.slot !== (variadicScope.fixedParamCount ?? 0) - 1) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset requires va_start() in a variadic function with its final fixed parameter in ${functionName}().`, { file, offset: 0 });
            }
            return { kind: "vaStart", list, type: toSemanticScalarType("int") };
        }
        case "vaArg": {
            const list = lookupVisible(scope, expr.list);
            const type = toSemanticType(expr.type);
            if (!list || list.kind !== "local" || list.type.kind !== "pointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset requires va_arg() to receive a local va_list in ${functionName}().`, { file, offset: 0 });
            }
            if (!getVariadicFunctionScope(scope)) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset permits va_arg() only in a variadic function in ${functionName}().`, { file, offset: 0 });
            }
            if (type.kind !== "scalar" && type.kind !== "pointer" && type.kind !== "functionPointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset va_arg() supports only char, int, scalar pointers, and function pointers in ${functionName}().`, { file, offset: 0 });
            }
            return { kind: "vaArg", list, width: type.width, type };
        }
        case "vaEnd": {
            const list = lookupVisible(scope, expr.list);
            if (!list || list.kind !== "local" || list.type.kind !== "pointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset requires va_end() to receive a local va_list in ${functionName}().`, { file, offset: 0 });
            }
            if (!getVariadicFunctionScope(scope)) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset permits va_end() only in a variadic function in ${functionName}().`, { file, offset: 0 });
            }
            return { kind: "vaEnd", type: toSemanticScalarType("int") };
        }
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
                    return { kind: "globalAddress", symbol, type: toSemanticPointerType(getArrayDecayPointee(symbol.type)) };
                }
                return { kind: "globalAddress", symbol, type: toSemanticPointerType(toPointerPointee(symbol.type)) };
            }
            if (symbol.type.kind === "array") {
                return { kind: "localAddress", symbol, type: toSemanticPointerType(getArrayDecayPointee(symbol.type)) };
            }
            return { kind: "localAddress", symbol, type: toSemanticPointerType(toPointerPointee(symbol.type)) };
        }
        case "addressOfExpr": {
            if (expr.expr.kind === "arrayPointerElement") {
                return getAggregateBasePointerFromExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file).pointer;
            }
            if (expr.expr.kind === "arrayIndex") {
                const symbol = lookupVisible(scope, expr.expr.name);
                if (symbol && symbol.kind !== "function" && symbol.type.kind === "array" && symbol.type.elementValueType?.kind === "aggregate") {
                    return getAggregateBasePointerFromExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file).pointer;
                }
            }
            if (isAggregateFieldAccessExpr(expr.expr)) {
                const arrayFieldAddress = getArrayFieldAddressFromConsumerExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file);
                if (arrayFieldAddress) {
                    return arrayFieldAddress;
                }
            }
            const target = analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file);
            if (isAggregateFieldAccessExpr(expr.expr) && target.type.kind === "pointer" && target.kind !== "deref") {
                return target;
            }
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
            if (target.kind === "aggregateProducerFieldRead") {
                return {
                    kind: "aggregateProducerFieldAddress",
                    source: target.source,
                    offset: target.offset,
                    type: toSemanticPointerType(toPointerPointee(target.type)),
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
            if (!symbol) {
                const functionSymbol = functionSymbols.get(expr.name);
                if (functionSymbol) {
                    return {
                        kind: "functionAddress",
                        name: functionSymbol.name,
                        type: toSemanticFunctionPointerType(functionSymbol),
                    };
                }
            }
            if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global")) {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not know symbol '${expr.name}'.`, {
                    file,
                    offset: 0,
                });
            }
            if (symbol.kind === "global") {
                if (symbol.type.kind === "array") {
                    return { kind: "globalAddress", symbol, type: toSemanticPointerType(getArrayDecayPointee(symbol.type)) };
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
                return { kind: "localAddress", symbol, type: toSemanticPointerType(getArrayDecayPointee(symbol.type)) };
            }
            if (symbol.kind === "param" && symbol.type.kind === "array") {
                return { kind: "ref", symbol, type: toSemanticPointerType(getArrayDecayPointee(symbol.type)) };
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
            const rawField = getAggregateFieldLayout(symbol.type, expr.field, functionName, sourceText, file);
            if (rawField.type.kind === "array") {
                return getArrayFieldAddressFromConsumerExpr(expr, scope, functionSymbols, functionName, sourceText, file);
            }
            const field = getReadableAggregateFieldLayout(symbol.type, expr.field, functionName, sourceText, file);
            if (field.type.kind === "scalar") {
                return {
                    kind: "aggregateFieldAccess",
                    symbol,
                    offset: field.offset,
                    type: field.type,
                };
            }
            return {
                kind: "deref",
                pointer: {
                    kind: "pointerAdd",
                    pointer: symbol.kind === "param"
                        ? {
                            kind: "ref",
                            symbol,
                            type: toSemanticPointerType({
                                kind: "aggregate",
                                aggregateKind: symbol.type.aggregateKind,
                                name: symbol.type.name,
                            }),
                        }
                        : getAggregateStorageAddress(symbol, symbol.type),
                    index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                    pointee: "char",
                    type: toSemanticPointerType("char"),
                },
                type: field.type,
            };
        }
        case "memberArrayIndex": {
            return analyzeAggregateArrayFieldIndexExpr(expr.name, expr.field, expr.index, scope, functionSymbols, functionName, sourceText, file);
        }
        case "memberExprArrayIndex": {
            return analyzeAggregateArrayFieldIndexExprTarget(expr.target, expr.field, expr.index, scope, functionSymbols, functionName, sourceText, file);
        }
        case "memberExprAccess": {
            if (getAggregateFieldLayoutForConsumerTarget(expr.target, expr.field, scope, functionSymbols, functionName, sourceText, file).type.kind === "array") {
                return getArrayFieldAddressFromConsumerExpr(expr, scope, functionSymbols, functionName, sourceText, file);
            }
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
        case "pointerMemberArrayIndex": {
            return analyzePointerAggregateArrayFieldIndexExpr(expr.name, expr.field, expr.index, scope, functionSymbols, functionName, sourceText, file);
        }
        case "pointerMemberExprArrayIndex": {
            return analyzePointerAggregateArrayFieldIndexExprTarget(expr.target, expr.field, expr.index, scope, functionSymbols, functionName, sourceText, file);
        }
        case "pointerMemberAccess": {
            const symbol = lookupVisible(scope, expr.name);
            if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "pointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers, got '${expr.name}->${expr.field}' in ${functionName}().`, {
                    file,
                    offset: 0,
                });
            }
            const aggregatePointee = getAggregatePointerPointee(symbol.type, functionName, sourceText, file);
            const aggregateType = toSemanticType({
                kind: "aggregate",
                aggregateKind: aggregatePointee.aggregateKind,
                name: aggregatePointee.name,
            });
            const rawField = getAggregateFieldLayout(aggregateType, expr.field, functionName, sourceText, file);
            if (rawField.type.kind === "array") {
                return getArrayFieldAddressFromConsumerExpr(expr, scope, functionSymbols, functionName, sourceText, file);
            }
            const field = getReadableAggregateFieldLayout(aggregateType, expr.field, functionName, sourceText, file);
            return {
                kind: "deref",
                pointer: {
                    kind: "pointerAdd",
                    pointer: symbol.kind === "global"
                        ? { kind: "globalRef", symbol, type: symbol.type }
                        : { kind: "ref", symbol, type: symbol.type },
                    index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
                    pointee: "char",
                    type: toSemanticPointerType("char"),
                },
                type: field.type,
            };
        }
        case "pointerMemberExprAccess": {
            const pointer = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
            const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
            const aggregateType = toSemanticType({
                kind: "aggregate",
                aggregateKind: aggregatePointee.aggregateKind,
                name: aggregatePointee.name,
            });
            const rawField = getAggregateFieldLayout(aggregateType, expr.field, functionName, sourceText, file);
            if (rawField.type.kind === "array") {
                return getArrayFieldAddressFromConsumerExpr(expr, scope, functionSymbols, functionName, sourceText, file);
            }
            const field = getReadableAggregateFieldLayout(aggregateType, expr.field, functionName, sourceText, file);
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
            return {
                kind: "deref",
                pointer,
                type: getPointerPointeeValueType(pointer.type, functionName, sourceText, file),
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
            if (symbol.type.elementValueType || symbol.type.dimensions?.length) {
                if (symbol.type.elementValueType?.kind === "aggregate" && !symbol.type.dimensions?.length) {
                    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset only supports aggregate array elements as aggregate consumers in ${functionName}().`, { file, offset: 0 });
                }
                const elementPointee = getArrayIndexPointee(symbol.type);
                const elementAddress = {
                    kind: "pointerAdd",
                    pointer: symbol.kind === "global"
                        ? { kind: "globalAddress", symbol, type: toSemanticPointerType(elementPointee) }
                        : symbol.kind === "local"
                            ? { kind: "localAddress", symbol, type: toSemanticPointerType(elementPointee) }
                            : { kind: "ref", symbol, type: toSemanticPointerType(elementPointee) },
                    index,
                    pointee: elementPointee,
                    type: toSemanticPointerType(elementPointee),
                };
                // A non-final subscript is an array lvalue.  Preserve its address and
                // trailing descriptor for the next postfix operation.
                if (typeof elementPointee !== "string" && elementPointee.kind === "arrayPointer") {
                    return elementAddress;
                }
                return {
                    kind: "deref",
                    pointer: elementAddress,
                    type: symbol.type.dimensions?.length
                        ? toSemanticPointerType(elementPointee)
                        : getArrayElementValueType(symbol.type),
                };
            }
            if (symbol.kind === "global") {
                return {
                    kind: "globalArrayElement",
                    symbol,
                    index,
                    type: toSemanticScalarType(symbol.type.elementType),
                };
            }
            if (symbol.kind === "param") {
                return {
                    kind: "paramArrayElement",
                    symbol,
                    index,
                    type: toSemanticScalarType(symbol.type.elementType),
                };
            }
            assertArrayIndexInBounds(index, expr.name, getSizedArrayLength(symbol.type), functionName, sourceText, file);
            return {
                kind: "localArrayElement",
                symbol,
                index,
                type: toSemanticScalarType(symbol.type.elementType),
            };
        }
        case "arrayPointerElement": {
            const pointer = analyzeExpr(expr.pointer, scope, functionSymbols, functionName, sourceText, file);
            if (pointer.type.kind !== "pointer" || typeof pointer.type.pointee === "string" || pointer.type.pointee.kind !== "arrayPointer") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports (*pointer-to-array)[index] in ${functionName}().`, { file, offset: 0 });
            }
            if (pointer.type.pointee.elementValueType?.kind === "aggregate") {
                (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset only supports aggregate array elements as aggregate consumers in ${functionName}().`, { file, offset: 0 });
            }
            const elementPointee = pointer.type.pointee.elementValueType ?? pointer.type.pointee.elementType;
            const elementAddress = {
                kind: "pointerAdd",
                pointer,
                index: analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file),
                pointee: elementPointee,
                type: toSemanticPointerType(elementPointee),
            };
            // An intermediate multidimensional subscript denotes an array lvalue.
            // Carry its address onward; materializing it as a word dereference would
            // read the first two element bytes as a pointer.
            if (typeof elementPointee !== "string" && elementPointee.kind === "arrayPointer") {
                return elementAddress;
            }
            return {
                kind: "deref",
                pointer: elementAddress,
                type: getArrayPointerElementValueType(pointer.type.pointee),
            };
        }
        case "call": {
            const target = functionSymbols.get(expr.target);
            if (target && (target.isVariadic ? expr.args.length < target.params.length : target.params.length !== expr.args.length)) {
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
                    if (symbol.type.isVariadic ? expr.args.length < symbol.type.params.length : symbol.type.params.length !== expr.args.length) {
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
                target: target ?? { kind: "extern", name: expr.target, ...(currentRuntimeVariadicNames.has(expr.target) ? { isVariadic: true } : {}) },
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
            if (target.type.isVariadic ? expr.args.length < target.type.params.length : target.type.params.length !== expr.args.length) {
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
            assertModifiableType(symbol.type, `object '${expr.name}'`, functionName, sourceText, file);
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
                assertModifiablePointee(symbol.type, `pointee of '${expr.name}'`, functionName, sourceText, file);
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
            assertModifiableArrayElement(symbol.type, `array element '${expr.name}[...]'`, functionName, sourceText, file);
            if (symbol.kind === "local") {
                assertArrayIndexInBounds(boundIndex, expr.name, getSizedArrayLength(symbol.type), functionName, sourceText, file);
            }
            if (symbol.type.elementType === "int") {
                return {
                    kind: "derefIncDec",
                    pointer: makeArrayElementPointer(symbol, boundIndex),
                    op: expr.op,
                    mode: expr.kind === "preArrayIncDec" ? "prefix" : "postfix",
                    type: toSemanticScalarType("int"),
                };
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
            assertModifiablePointee(pointer.type, "dereferenced pointer", functionName, sourceText, file);
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
            assertModifiableType(symbol.type, `object '${expr.name}'`, functionName, sourceText, file);
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
                if (symbol.type.elementValueType) {
                    if (symbol.type.elementValueType.kind === "aggregate") {
                        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset requires aggregate array assignments to be used as statements in ${functionName}().`, { file, offset: 0 });
                    }
                    const elementPointee = toArrayElementPointee(symbol.type);
                    return {
                        kind: "derefAssign",
                        pointer: {
                            kind: "pointerAdd",
                            pointer: { kind: "globalAddress", symbol, type: toSemanticPointerType(elementPointee) },
                            index: analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file),
                            pointee: elementPointee,
                            type: toSemanticPointerType(elementPointee),
                        },
                        expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
                        type: getArrayElementValueType(symbol.type),
                    };
                }
                return {
                    kind: "globalArrayAssignExpr",
                    target: symbol,
                    index: analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file),
                    expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
                    type: toSemanticScalarType("char"),
                };
            }
            if (symbol && (symbol.kind === "local" || symbol.kind === "param") && symbol.type.kind === "array" && symbol.type.elementValueType) {
                if (symbol.type.elementValueType.kind === "aggregate") {
                    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset requires aggregate array assignments to be used as statements in ${functionName}().`, { file, offset: 0 });
                }
                const elementPointee = toArrayElementPointee(symbol.type);
                return {
                    kind: "derefAssign",
                    pointer: {
                        kind: "pointerAdd",
                        pointer: symbol.kind === "local"
                            ? { kind: "localAddress", symbol, type: toSemanticPointerType(elementPointee) }
                            : { kind: "ref", symbol, type: toSemanticPointerType(elementPointee) },
                        index: analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file),
                        pointee: elementPointee,
                        type: toSemanticPointerType(elementPointee),
                    },
                    expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
                    type: getArrayElementValueType(symbol.type),
                };
            }
            const stmt = analyzeArrayAssignStmt(expr.name, expr.index, expr.expr, scope, functionSymbols, functionName, sourceText, file);
            if (stmt.kind === "expr") {
                return stmt.expr;
            }
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
        case "memberArrayAssign":
            return analyzeAggregateArrayFieldAssignExprTarget(expr.target, expr.field, expr.index, expr.expr, scope, functionSymbols, functionName, sourceText, file);
        case "pointerMemberArrayAssign":
            return analyzePointerAggregateArrayFieldAssignExpr(expr.name, expr.field, expr.index, expr.expr, scope, functionSymbols, functionName, sourceText, file);
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
            assertModifiablePointee(pointer.type, "dereferenced pointer", functionName, sourceText, file);
            return {
                kind: "derefAssign",
                pointer,
                expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
                type: getPointerPointeeValueType(pointer.type, functionName, sourceText, file),
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
                        pointee: left.type.pointee,
                        type: left.type,
                    };
                }
                if (left.type.kind === "scalar" && right.type.kind === "pointer" && expr.op === "+") {
                    return {
                        kind: "pointerAdd",
                        pointer: right,
                        index: left,
                        pointee: right.type.pointee,
                        type: right.type,
                    };
                }
                if (left.type.kind === "pointer" && right.type.kind === "pointer" && expr.op === "-") {
                    if (!samePointerType(left.type, right.type)) {
                        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset requires compatible pointer types for subtraction in ${functionName}().`, {
                            file,
                            offset: 0,
                        });
                    }
                    const byteDifference = {
                        kind: "additive",
                        left,
                        right,
                        op: "-",
                        type: toSemanticScalarType("int"),
                    };
                    const stride = getPointerPointeeStride(left.type.pointee);
                    if (stride === 1) {
                        return byteDifference;
                    }
                    const shift = Math.log2(stride);
                    if (Number.isInteger(shift)) {
                        return {
                            kind: "shift",
                            left: byteDifference,
                            right: { kind: "const", value: shift, type: toSemanticScalarType("int") },
                            op: ">>",
                            type: toSemanticScalarType("int"),
                        };
                    }
                    return {
                        kind: "multiplicative",
                        left: byteDifference,
                        right: { kind: "const", value: stride, type: toSemanticScalarType("int") },
                        op: "/",
                        type: toSemanticScalarType("int"),
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
function isAggregateFieldAccessExpr(expr) {
    switch (expr.kind) {
        case "memberAccess":
        case "memberExprAccess":
        case "pointerMemberAccess":
        case "pointerMemberExprAccess":
            return true;
        default:
            return false;
    }
}
function analyzeCallArg(arg, paramType, scope, functionSymbols, functionName, sourceText, file) {
    if (paramType?.kind === "aggregate") {
        return analyzeAggregateProducerExpr(arg, scope, functionSymbols, paramType, functionName, sourceText, file);
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
function getVariadicFunctionScope(scope) {
    for (let current = scope; current; current = current.parent) {
        if (current.isVariadicFunction) {
            return current;
        }
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
        return toSemanticScalarType(type.name, type.qualifiers);
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
            ...(hasTypeQualifiers(type.qualifiers) ? { qualifiers: type.qualifiers } : {}),
        };
    }
    if (type.kind === "pointer") {
        return toSemanticPointerType(type.pointee, type.qualifiers, type.pointeeQualifiers);
    }
    if (type.kind === "functionPointer") {
        return {
            kind: "functionPointer",
            returnType: toSemanticType(type.returnType),
            params: type.params.map((param) => toSemanticType(param)),
            width: 2,
            ...(type.isVariadic ? { isVariadic: true } : {}),
            ...(hasTypeQualifiers(type.qualifiers) ? { qualifiers: type.qualifiers } : {}),
        };
    }
    return {
        kind: "array",
        elementType: type.elementType,
        elementValueType: type.elementValueType ? toSemanticType(type.elementValueType) : undefined,
        dimensions: type.dimensions,
        length: type.length,
        ...(hasTypeQualifiers(type.qualifiers) ? { qualifiers: type.qualifiers } : {}),
        ...(hasTypeQualifiers(type.elementQualifiers) ? { elementQualifiers: type.elementQualifiers } : {}),
    };
}
function toSemanticFunctionPointerType(fn) {
    return {
        kind: "functionPointer",
        returnType: fn.returnType,
        params: fn.params,
        width: 2,
        ...(fn.isVariadic ? { isVariadic: true } : {}),
    };
}
function toSemanticScalarType(type, qualifiers) {
    return {
        kind: "scalar",
        name: type,
        width: type === "char" ? 1 : 2,
        ...(hasTypeQualifiers(qualifiers) ? { qualifiers } : {}),
    };
}
function toSemanticPointerType(pointee, qualifiers, pointeeQualifiers) {
    return {
        kind: "pointer",
        pointee,
        width: 2,
        ...(hasTypeQualifiers(qualifiers) ? { qualifiers } : {}),
        ...(hasTypeQualifiers(pointeeQualifiers) ? { pointeeQualifiers } : {}),
    };
}
function hasTypeQualifiers(qualifiers) {
    return Boolean(qualifiers?.isConst || qualifiers?.isVolatile || qualifiers?.isRestrict);
}
function assertModifiableType(type, description, functionName, sourceText, file) {
    if (type.qualifiers?.isConst) {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset cannot modify const-qualified ${description} in ${functionName}().`, { file, offset: 0 });
    }
}
function assertModifiablePointee(type, description, functionName, sourceText, file) {
    if (type.pointeeQualifiers?.isConst) {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset cannot modify const-qualified ${description} in ${functionName}().`, { file, offset: 0 });
    }
}
function assertModifiableArrayElement(type, description, functionName, sourceText, file) {
    if (type.elementQualifiers?.isConst || type.qualifiers?.isConst) {
        (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset cannot modify const-qualified ${description} in ${functionName}().`, { file, offset: 0 });
    }
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
            return type;
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
    return getArrayStorageBytes(type);
}
function getArrayDecayPointee(type) {
    const element = toArrayElementPointee(type);
    const build = (dimensions) => {
        if (dimensions.length === 0)
            return element;
        const [length, ...tail] = dimensions;
        const nested = build(tail);
        return {
            kind: "arrayPointer",
            elementType: type.elementType,
            ...(typeof nested === "string" ? {} : { elementValueType: nested }),
            length,
        };
    };
    return build(type.dimensions ?? []);
}
function getArrayIndexPointee(type) {
    const remaining = type.dimensions ?? [];
    if (remaining.length === 0)
        return toArrayElementPointee(type);
    const element = toArrayElementPointee(type);
    const build = (dimensions) => {
        if (dimensions.length === 0)
            return element;
        const [length, ...tail] = dimensions;
        const nested = build(tail);
        return { kind: "arrayPointer", elementType: type.elementType, ...(typeof nested === "string" ? {} : { elementValueType: nested }), length };
    };
    return build(remaining);
}
function toArrayElementPointee(type) {
    if (!type.elementValueType) {
        return type.elementType;
    }
    if (type.elementValueType.kind === "aggregate") {
        return { kind: "aggregate", aggregateKind: type.elementValueType.aggregateKind, name: type.elementValueType.name };
    }
    if (type.elementValueType.kind === "pointer") {
        return { kind: "pointer", pointee: type.elementValueType.pointee };
    }
    return type.elementValueType;
}
function getArrayElementValueType(type) {
    if (!type.elementValueType) {
        return toSemanticScalarType(type.elementType);
    }
    if (type.elementValueType.kind === "aggregate") {
        throw new Error("Aggregate array elements are consumed through aggregateAddress.");
    }
    return type.elementValueType;
}
function getArrayPointerElementValueType(type) {
    if (!type.elementValueType) {
        return toSemanticScalarType(type.elementType);
    }
    if (type.elementValueType.kind === "aggregate") {
        throw new Error("Aggregate array elements are consumed through aggregateAddress.");
    }
    if (type.elementValueType.kind === "arrayPointer") {
        return toSemanticPointerType(type.elementValueType);
    }
    return toSemanticType(type.elementValueType);
}
function getArrayStorageBytes(type) {
    if (type.length === undefined) {
        throw new Error(`Unsized arrays are only supported for parameters, got ${JSON.stringify(type)}`);
    }
    return [type.length, ...(type.dimensions ?? [])].reduce((bytes, length) => bytes * length, getArrayElementStorageBytes(type));
}
function getArrayElementStorageBytes(type) {
    if (!type.elementValueType) {
        return type.elementType === "char" ? 1 : 2;
    }
    if (type.elementValueType.kind === "aggregate") {
        return "size" in type.elementValueType
            ? type.elementValueType.size
            : getTypeStorageBytes(type.elementValueType);
    }
    return 2;
}
function getBoundExprStorageBytes(expr) {
    switch (expr.kind) {
        case "const":
        case "string":
        case "vaStart":
        case "vaArg":
        case "vaEnd":
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
        case "aggregateProducerFieldRead":
        case "aggregateProducerFieldAddress":
        case "pointerAdd":
        case "arrayElementAddress":
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
            ? (symbol.type.length ?? 2) * (symbol.type.elementType === "char" ? 1 : 2)
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
    if (left.kind === "arrayPointer" || right.kind === "arrayPointer") {
        return left.kind === "arrayPointer"
            && right.kind === "arrayPointer"
            && left.elementType === right.elementType
            && sameArrayPointerElementType(left.elementValueType, right.elementValueType)
            && left.length === right.length;
    }
    if (left.kind === "functionPointer" || right.kind === "functionPointer") {
        return left.kind === "functionPointer"
            && right.kind === "functionPointer"
            && Boolean(left.isVariadic) === Boolean(right.isVariadic);
    }
    return samePointerPointee(left.pointee, right.pointee);
}
function isZeroConstantExpr(expr) {
    return expr.kind === "const" && expr.value === 0;
}
function getPointerPointeeStride(pointee) {
    if (typeof pointee === "string") {
        return pointee === "char" ? 1 : 2;
    }
    if (pointee.kind === "arrayPointer") {
        return getArrayPointerElementStorageBytes(pointee) * pointee.length;
    }
    if (pointee.kind === "aggregate") {
        const layout = currentAggregateLayouts.get(`${pointee.aggregateKind}:${pointee.name}`);
        if (!layout) {
            throw new Error(`Unknown aggregate pointer-difference pointee '${pointee.aggregateKind} ${pointee.name}'.`);
        }
        return layout.size;
    }
    if (pointee.kind === "pointer" || pointee.kind === "functionPointer") {
        return 2;
    }
    throw new Error(`Pointer difference requires a sized scalar, array, or pointer pointee, got ${JSON.stringify(pointee)}.`);
}
function sameArrayPointerElementType(left, right) {
    if (!left || !right) {
        return left === right;
    }
    return samePointerPointee(left, right);
}
function getArrayPointerElementStorageBytes(type) {
    if (!type.elementValueType) {
        return type.elementType === "char" ? 1 : 2;
    }
    if (type.elementValueType.kind === "aggregate") {
        const layout = currentAggregateLayouts.get(`${type.elementValueType.aggregateKind}:${type.elementValueType.name}`);
        if (!layout) {
            throw new Error(`Unknown aggregate pointer-to-array element '${type.elementValueType.aggregateKind} ${type.elementValueType.name}'.`);
        }
        return layout.size;
    }
    if (type.elementValueType.kind === "arrayPointer") {
        return type.elementValueType.length * getArrayPointerElementStorageBytes(type.elementValueType);
    }
    return 2;
}
function getScalarPointerPointee(type, functionName, sourceText, file) {
    if (typeof type.pointee === "string") {
        return type.pointee;
    }
    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not yet support ${formatPointerPointee(type.pointee)} pointee layout operations in ${functionName}().`, { file, offset: 0 });
}
function getPointerPointeeValueType(type, functionName, sourceText, file) {
    if (typeof type.pointee === "string") {
        return toSemanticScalarType(type.pointee);
    }
    if (type.pointee.kind === "pointer") {
        return {
            kind: "pointer",
            pointee: type.pointee.pointee,
            width: 2,
        };
    }
    if (type.pointee.kind === "arrayPointer") {
        return toSemanticPointerType(type.pointee);
    }
    if (type.pointee.kind === "functionPointer") {
        return toSemanticType(type.pointee);
    }
    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset does not support aggregate dereference values in ${functionName}().`, { file, offset: 0 });
}
function formatPointerPointee(type) {
    if (type.kind === "aggregate") {
        return `${type.aggregateKind} ${type.name}`;
    }
    if (type.kind === "arrayPointer") {
        const element = type.elementValueType ? formatPointerPointee(type.elementValueType) : type.elementType;
        return `${element}[${type.length}]`;
    }
    if (type.kind === "functionPointer") {
        return "function pointer";
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
            // Layout construction is recursive and runs before
            // currentAggregateLayouts is published.  Resolve aggregate array
            // elements through this resolver instead of the global layout map.
            const element = type.elementValueType
                ? type.elementValueType
                : { kind: "scalar", name: type.elementType };
            return [type.length, ...(type.dimensions ?? [])].reduce((size, dimension) => size * dimension, resolveFieldSize(element));
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
function getAssignableAggregateFieldLayout(type, fieldName, functionName, sourceText, file, isInitialization = false) {
    if (!isInitialization) {
        assertModifiableType(type, "aggregate object", functionName, sourceText, file);
    }
    const field = getAggregateFieldLayout(type, fieldName, functionName, sourceText, file);
    if (!isInitialization) {
        assertModifiableType(field.type, `field '${fieldName}'`, functionName, sourceText, file);
    }
    if (field.type.kind === "scalar") {
        return {
            offset: field.offset,
            type: toSemanticScalarType(field.type.name, field.type.qualifiers),
        };
    }
    if (field.type.kind === "pointer") {
        return {
            offset: field.offset,
            type: toSemanticPointerType(field.type.pointee, field.type.qualifiers, field.type.pointeeQualifiers),
        };
    }
    if (field.type.kind === "functionPointer") {
        return {
            offset: field.offset,
            type: {
                kind: "functionPointer",
                returnType: toSemanticType(field.type.returnType),
                params: field.type.params.map((param) => toSemanticType(param)),
                width: 2,
                ...(hasTypeQualifiers(field.type.qualifiers) ? { qualifiers: field.type.qualifiers } : {}),
            },
        };
    }
    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar/pointer/function-pointer field assignment on ${type.aggregateKind} ${type.name}.${fieldName} in ${functionName}().`, {
        file,
        offset: 0,
    });
}
function getReadableAggregateFieldLayout(type, fieldName, functionName, sourceText, file) {
    const field = getAggregateFieldLayout(type, fieldName, functionName, sourceText, file);
    if (field.type.kind === "scalar") {
        return { offset: field.offset, type: toSemanticScalarType(field.type.name, field.type.qualifiers) };
    }
    if (field.type.kind === "pointer") {
        return { offset: field.offset, type: toSemanticPointerType(field.type.pointee, field.type.qualifiers, field.type.pointeeQualifiers) };
    }
    if (field.type.kind === "functionPointer") {
        return {
            offset: field.offset,
            type: {
                kind: "functionPointer",
                returnType: toSemanticType(field.type.returnType),
                params: field.type.params.map((param) => toSemanticType(param)),
                width: 2,
                ...(hasTypeQualifiers(field.type.qualifiers) ? { qualifiers: field.type.qualifiers } : {}),
            },
        };
    }
    (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar/pointer/function-pointer field assignment or access on ${type.aggregateKind} ${type.name}.${fieldName} in ${functionName}().`, {
        file,
        offset: 0,
    });
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
    if (targetExpr.kind === "arrayIndex") {
        const symbol = lookupVisible(scope, targetExpr.name);
        if (!symbol
            || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global")
            || symbol.type.kind !== "array"
            || !symbol.type.elementValueType
            || symbol.type.elementValueType.kind !== "aggregate") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset expected an aggregate array element in ${functionName}().`, { file, offset: 0 });
        }
        const type = symbol.type.elementValueType;
        const base = symbol.kind === "global"
            ? { kind: "globalAddress", symbol, type: toSemanticPointerType("char") }
            : symbol.kind === "local"
                ? { kind: "localAddress", symbol, type: toSemanticPointerType("char") }
                : { kind: "ref", symbol, type: toSemanticPointerType("char") };
        return {
            pointer: {
                kind: "arrayElementAddress",
                base,
                indices: [analyzeExpr(targetExpr.index, scope, functionSymbols, functionName, sourceText, file)],
                scales: [type.size],
                type: toSemanticPointerType({ kind: "aggregate", aggregateKind: type.aggregateKind, name: type.name }),
            },
            type,
        };
    }
    if (targetExpr.kind === "arrayPointerElement") {
        const rowPointer = analyzeExpr(targetExpr.pointer, scope, functionSymbols, functionName, sourceText, file);
        if (rowPointer.type.kind !== "pointer"
            || typeof rowPointer.type.pointee === "string"
            || rowPointer.type.pointee.kind !== "arrayPointer"
            || !rowPointer.type.pointee.elementValueType
            || rowPointer.type.pointee.elementValueType.kind !== "aggregate") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter C Subset expected an aggregate array element in ${functionName}().`, { file, offset: 0 });
        }
        const aggregate = rowPointer.type.pointee.elementValueType;
        const type = toSemanticType(aggregate);
        return {
            pointer: {
                kind: "arrayElementAddress",
                base: rowPointer,
                indices: [analyzeExpr(targetExpr.index, scope, functionSymbols, functionName, sourceText, file)],
                scales: [type.size],
                type: toSemanticPointerType({ kind: "aggregate", aggregateKind: aggregate.aggregateKind, name: aggregate.name }),
            },
            type,
        };
    }
    if (targetExpr.kind === "ref") {
        const symbol = lookupVisible(scope, targetExpr.name);
        if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
            (0, tsFrontendDiagnostics_1.throwDiagnostic)(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested aggregate lvalues on local/global struct/union objects in ${functionName}().`, {
                file,
                offset: 0,
            });
        }
        return {
            pointer: symbol.kind === "param"
                ? {
                    kind: "ref",
                    symbol,
                    type: toSemanticPointerType({ kind: "aggregate", aggregateKind: symbol.type.aggregateKind, name: symbol.type.name }),
                }
                : getAggregateStorageAddress(symbol, symbol.type),
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
        return {
            ...type.pointee,
            ...(hasTypeQualifiers(type.pointeeQualifiers) ? { qualifiers: { ...type.pointee.qualifiers, ...type.pointeeQualifiers } } : {}),
        };
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

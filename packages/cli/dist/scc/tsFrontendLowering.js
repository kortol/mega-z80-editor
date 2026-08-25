"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lowerSourceProgram = lowerSourceProgram;
const tsFrontendSemantic_1 = require("./tsFrontendSemantic");
const tsProgram_1 = require("./tsProgram");
function lowerSourceProgram(program, moduleName, sourceText, file) {
    const definedFunctions = new Set(program.functions.map((fn) => fn.name));
    const externs = new Set();
    const state = { nextStringId: 0, data: [], bss: [] };
    const globalsByName = new Map(program.globals.map((global) => [global.name, global]));
    for (const global of program.globals) {
        if (global.isExtern) {
            continue;
        }
        const storage = lowerGlobalStorage(global, globalsByName);
        if (storage.data) {
            state.data.push(...storage.data);
        }
        if (storage.bss) {
            state.bss.push(...storage.bss);
        }
    }
    const functions = program.functions.map((fn) => lowerFunction(fn, externs, definedFunctions, sourceText, state, file));
    return {
        moduleName,
        exports: Array.from(new Set([
            ...program.functions.filter((fn) => !fn.isStatic).map((fn) => fn.name),
            ...program.globals.filter((global) => !global.isExtern && !global.isStatic).map((global) => global.name),
        ])),
        externs: Array.from(externs),
        data: state.data.length > 0 ? state.data : undefined,
        bss: state.bss.length > 0 ? state.bss : undefined,
        functions,
        includeBss: true,
    };
}
function lowerGlobalStorage(global, globalsByName) {
    const label = global.name;
    switch (global.type.kind) {
        case "scalar":
            return global.initializer
                ? {
                    data: [{
                            label,
                            directive: global.type.width === 1 ? ".db" : ".dw",
                            value: global.initializer.kind === "expr" && global.initializer.expr.kind === "const"
                                ? `${global.initializer.expr.value}`
                                : "0",
                        }],
                }
                : {
                    bss: [{
                            label,
                            directive: ".ds",
                            value: `${global.type.width}`,
                        }],
                };
        case "pointer":
            return global.initializer
                ? {
                    data: [{
                            label,
                            directive: ".dw",
                            value: lowerGlobalWordInitializer(global.initializer, globalsByName),
                        }],
                }
                : {
                    bss: [{
                            label,
                            directive: ".ds",
                            value: "2",
                        }],
                };
        case "array":
            return global.initializer
                ? {
                    data: global.type.elementValueType?.kind === "aggregate"
                        ? flattenGlobalAggregateArrayInitializer(label, global.type, global.initializer, globalsByName)
                        : [{
                                label,
                                directive: global.type.elementValueType || global.type.elementType === "int" ? ".dw" : ".db",
                                value: lowerGlobalArrayInitializer(global.initializer, getArrayElementCount(global.type), global.type, globalsByName),
                            }],
                }
                : {
                    bss: [{
                            label,
                            directive: ".ds",
                            value: `${getArrayStorageBytes(global.type)}`,
                        }],
                };
        case "aggregate":
            return global.initializer
                ? {
                    data: lowerGlobalAggregateInitializer(global.name, global.type, global.initializer, globalsByName),
                }
                : {
                    bss: [{
                            label,
                            directive: ".ds",
                            value: `${global.type.size}`,
                        }],
                };
        case "functionPointer":
            return global.initializer
                ? {
                    data: [{
                            label,
                            directive: ".dw",
                            value: lowerGlobalFunctionPointerInitializer(global.initializer, globalsByName),
                        }],
                }
                : {
                    bss: [{
                            label,
                            directive: ".ds",
                            value: "2",
                        }],
                };
        default:
            return {};
    }
}
function lowerGlobalArrayInitializer(initializer, length, type, globalsByName) {
    if (type.elementValueType && initializer?.kind === "list") {
        const values = flattenGlobalArrayInitializerItems(initializer, [type.length ?? 0, ...(type.dimensions ?? [])], "<array>").map((item) => type.elementValueType?.kind === "functionPointer"
            ? lowerGlobalFunctionPointerInitializer(item, globalsByName)
            : lowerGlobalWordInitializer(item, globalsByName));
        return values.join(",");
    }
    if (type.elementType === "int" && initializer?.kind === "list") {
        const values = flattenGlobalArrayInitializerItems(initializer, [type.length ?? 0, ...(type.dimensions ?? [])], "<array>").map((item) => item?.kind === "expr" && item.expr.kind === "const" ? `${item.expr.value}` : "0");
        return values.join(",");
    }
    return lowerGlobalArrayInitializerBytes(initializer, length, [type.length ?? 0, ...(type.dimensions ?? [])]).join(",");
}
function flattenGlobalArrayInitializerItems(initializer, dimensions, label) {
    const items = [];
    const visit = (value, depth) => {
        if (depth === dimensions.length) {
            items.push(value);
            return;
        }
        if (value && value.kind !== "list") {
            throw new Error(`Global array initializer '${label}' requires nested braces at dimension ${depth + 1}.`);
        }
        const children = value?.kind === "list" ? value.items : [];
        if (children.length > dimensions[depth]) {
            throw new Error(`Global array initializer '${label}' exceeds dimension ${depth + 1}.`);
        }
        for (let index = 0; index < dimensions[depth]; index += 1) {
            visit(children[index], depth + 1);
        }
    };
    visit(initializer, 0);
    return items;
}
function getArrayElementCount(type) {
    return [type.length ?? 0, ...(type.dimensions ?? [])].reduce((count, length) => count * length, 1);
}
function getArrayStorageBytes(type) {
    const elementBytes = !type.elementValueType
        ? (type.elementType === "char" ? 1 : 2)
        : type.elementValueType.kind === "aggregate"
            ? ("size" in type.elementValueType ? type.elementValueType.size : (0, tsFrontendSemantic_1.getAggregateLayoutSize)(type.elementValueType))
            : 2;
    return getArrayElementCount(type) * elementBytes;
}
function lowerGlobalArrayInitializerBytes(initializer, length, dimensions = [length]) {
    if (!initializer) {
        return Array.from({ length }, () => "0");
    }
    if (initializer.kind === "expr" && initializer.expr.kind === "string") {
        const values = Array.from(initializer.expr.value, (ch) => `${ch.charCodeAt(0)}`);
        if (values.length < length) {
            values.push("0");
        }
        while (values.length < length) {
            values.push("0");
        }
        return values;
    }
    if (initializer.kind === "list") {
        return flattenGlobalArrayInitializerItems(initializer, dimensions, "<array>").map((item) => item?.kind === "expr" && item.expr.kind === "const" ? `${item.expr.value}` : "0");
    }
    return Array.from({ length }, () => "0");
}
function lowerGlobalAggregateInitializer(name, type, initializer, globalsByName) {
    return flattenGlobalAggregateInitializer(undefined, name, type, initializer, globalsByName);
}
function flattenGlobalAggregateArrayInitializer(outputLabel, type, initializer, globalsByName) {
    const elementType = type.elementValueType;
    if (!elementType || elementType.kind !== "aggregate") {
        throw new Error("Aggregate array lowering requires an aggregate element type.");
    }
    const dimensions = [type.length ?? 0, ...(type.dimensions ?? [])];
    const items = normalizeFlatGlobalAggregateArrayItems(initializer, dimensions, elementType, outputLabel ?? "<array>")
        ?? flattenGlobalAggregateArrayItems(initializer, dimensions, outputLabel ?? "<array>");
    const values = [];
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item && item.kind !== "list") {
            throw new Error(`Global aggregate array initializer '${outputLabel ?? "<array>"}' requires braces for element ${index}.`);
        }
        values.push(...flattenGlobalAggregateInitializer(index === 0 ? outputLabel : undefined, `${outputLabel ?? "<array>"}[${index}]`, elementType, item, globalsByName, false));
    }
    return values;
}
function normalizeFlatGlobalAggregateArrayItems(initializer, dimensions, elementType, label) {
    if (!initializer || initializer.kind !== "list" || !initializer.items.some((item) => item.kind === "expr")) {
        return undefined;
    }
    if (!initializer.items.every((item) => item.kind === "expr")) {
        throw new Error(`Global aggregate array initializer '${label}' cannot mix flat and braced elements.`);
    }
    if (elementType.aggregateKind !== "struct") {
        throw new Error(`Global ${elementType.aggregateKind} array initializer '${label}' requires explicit braces.`);
    }
    const fieldCount = getFlatGlobalAggregateInitializerWidth(elementType);
    if (fieldCount === undefined) {
        throw new Error(`Global nested aggregate array initializer '${label}' requires explicit braces.`);
    }
    const elementCount = dimensions.reduce((product, dimension) => product * dimension, 1);
    if (initializer.items.length > elementCount * fieldCount) {
        throw new Error(`Global aggregate array initializer '${label}' exceeds its capacity.`);
    }
    const values = [];
    let cursor = 0;
    for (let index = 0; index < elementCount; index += 1) {
        const consumed = consumeFlatGlobalAggregateInitializer(elementType, initializer.items, cursor);
        values.push(consumed.initializer);
        cursor = consumed.next;
    }
    return values;
}
function getFlatGlobalAggregateInitializerWidth(type) {
    if (type.aggregateKind !== "struct") {
        return undefined;
    }
    let width = 0;
    for (const field of (0, tsFrontendSemantic_1.getAggregateLayoutFields)(type)) {
        const fieldWidth = getFlatGlobalInitializerWidth(field.type);
        if (fieldWidth === undefined) {
            return undefined;
        }
        width += fieldWidth;
    }
    return width;
}
function getFlatGlobalInitializerWidth(type) {
    if (type.kind === "scalar" || type.kind === "pointer" || type.kind === "functionPointer") {
        return 1;
    }
    if (type.kind === "aggregate") {
        return getFlatGlobalAggregateInitializerWidth(type);
    }
    if (type.kind !== "array" || type.length === undefined || type.dimensions?.length) {
        return undefined;
    }
    const elementType = type.elementValueType ?? { kind: "scalar", name: type.elementType };
    const elementWidth = getFlatGlobalInitializerWidth(elementType);
    return elementWidth === undefined ? undefined : type.length * elementWidth;
}
function consumeFlatGlobalAggregateInitializer(type, items, start) {
    const values = [];
    let cursor = start;
    for (const field of (0, tsFrontendSemantic_1.getAggregateLayoutFields)(type)) {
        if (cursor >= items.length) {
            break;
        }
        const consumed = consumeFlatGlobalInitializerValue(field.type, items, cursor);
        values.push(consumed.initializer);
        cursor = consumed.next;
    }
    return { initializer: { kind: "list", items: values }, next: cursor };
}
function consumeFlatGlobalInitializerValue(type, items, start) {
    if (type.kind === "scalar" || type.kind === "pointer" || type.kind === "functionPointer") {
        return { initializer: items[start], next: start + 1 };
    }
    if (type.kind === "aggregate") {
        return consumeFlatGlobalAggregateInitializer(type, items, start);
    }
    if (type.kind === "array" && type.length !== undefined && !type.dimensions?.length) {
        const elementType = type.elementValueType ?? { kind: "scalar", name: type.elementType };
        const values = [];
        let cursor = start;
        for (let index = 0; index < type.length && cursor < items.length; index += 1) {
            const consumed = consumeFlatGlobalInitializerValue(elementType, items, cursor);
            values.push(consumed.initializer);
            cursor = consumed.next;
        }
        return { initializer: { kind: "list", items: values }, next: cursor };
    }
    throw new Error(`Unsupported global flat initializer type '${JSON.stringify(type)}'.`);
}
function flattenGlobalAggregateArrayItems(initializer, dimensions, label) {
    const items = [];
    const visit = (value, depth) => {
        if (depth === dimensions.length) {
            items.push(value);
            return;
        }
        if (value && value.kind !== "list") {
            throw new Error(`Global aggregate array initializer '${label}' requires nested braces at dimension ${depth + 1}.`);
        }
        const children = value?.kind === "list" ? value.items : [];
        if (children.length > dimensions[depth]) {
            throw new Error(`Global aggregate array initializer '${label}' exceeds dimension ${depth + 1}.`);
        }
        for (let index = 0; index < dimensions[depth]; index += 1) {
            visit(children[index], depth + 1);
        }
    };
    visit(initializer, 0);
    return items;
}
function flattenGlobalAggregateInitializer(outputLabel, name, type, initializer, globalsByName, emitFallbackLabel = true) {
    if (!initializer) {
        return [{
                label: outputLabel ?? (emitFallbackLabel ? name : undefined),
                directive: ".db",
                value: Array.from({ length: "size" in type ? type.size : (0, tsFrontendSemantic_1.getAggregateLayoutSize)(type) }, () => "0").join(","),
            }];
    }
    if (initializer.kind !== "list") {
        throw new Error(`Global aggregate initializer for '${name}' must be a brace list.`);
    }
    const values = [];
    const fields = (0, tsFrontendSemantic_1.getAggregateLayoutFields)(type);
    let emittedLabel = false;
    for (const [index, field] of fields.entries()) {
        const entries = flattenGlobalInitializerValue(emittedLabel ? undefined : (outputLabel ?? (emitFallbackLabel ? name : undefined)), `${name}.${field.name}`, field.type, initializer.items[index], globalsByName, emitFallbackLabel);
        values.push(...entries);
        emittedLabel = emittedLabel || entries.length > 0;
    }
    return values;
}
function flattenGlobalInitializerValue(outputLabel, label, type, initializer, globalsByName, emitFallbackLabel = true) {
    switch (type.kind) {
        case "void":
            throw new Error(`Global initializer cannot materialize void field '${label}'.`);
        case "scalar":
            return [{
                    label: outputLabel,
                    directive: type.name === "char" ? ".db" : ".dw",
                    value: type.name === "char" ? `${initializerConstValue(label, initializer) & 0xff}` : `${initializerConstValue(label, initializer)}`,
                }];
        case "pointer":
            return [{
                    label: outputLabel,
                    directive: ".dw",
                    value: lowerGlobalWordInitializer(initializer, globalsByName),
                }];
        case "aggregate":
            return flattenGlobalAggregateInitializer(outputLabel, label, type, initializer, globalsByName, emitFallbackLabel);
        case "array":
            if (type.elementValueType?.kind === "aggregate") {
                return flattenGlobalAggregateArrayInitializer(outputLabel, type, initializer, globalsByName);
            }
            return [{
                    label: outputLabel,
                    directive: type.elementValueType || type.elementType === "int" ? ".dw" : ".db",
                    value: lowerGlobalArrayInitializer(initializer, getArrayElementCount(type), type, globalsByName),
                }];
        case "functionPointer":
            return [{
                    label: outputLabel,
                    directive: ".dw",
                    value: lowerGlobalFunctionPointerInitializer(initializer, globalsByName),
                }];
        default:
            return [{ label: outputLabel, directive: ".db", value: "0" }];
    }
}
function lowerGlobalWordInitializer(initializer, globalsByName) {
    if (!initializer) {
        return "0";
    }
    if (initializer.kind === "expr") {
        if (initializer.expr.kind === "const") {
            return `${initializer.expr.value}`;
        }
        if (initializer.expr.kind === "addressOf") {
            return `${initializer.expr.name}+0`;
        }
        if (initializer.expr.kind === "addressOfExpr") {
            const address = resolveStaticGlobalFieldAddress(initializer.expr.expr, globalsByName);
            if (address) {
                return `${address.name}+${address.offset}`;
            }
        }
    }
    if (initializer.kind === "list" && initializer.items.length === 0) {
        return "0";
    }
    throw new Error("Global word initializer must be a constant or address expression.");
}
function lowerGlobalFunctionPointerInitializer(initializer, globalsByName) {
    if (initializer?.kind === "expr" && initializer.expr.kind === "ref") {
        return `${initializer.expr.name}+0`;
    }
    return lowerGlobalWordInitializer(initializer, globalsByName);
}
function resolveStaticGlobalFieldAddress(expr, globalsByName) {
    if (!globalsByName) {
        return null;
    }
    if (expr.kind === "memberAccess") {
        const global = globalsByName.get(expr.name);
        if (!global || global.type.kind !== "aggregate") {
            return null;
        }
        const field = getAggregateFieldOffset(global.type, expr.field);
        return field ? { name: global.name, offset: field.offset, type: field.type } : null;
    }
    if (expr.kind === "memberExprAccess") {
        const target = resolveStaticGlobalFieldAddress(expr.target, globalsByName);
        if (!target || target.type.kind !== "aggregate") {
            return null;
        }
        const field = getAggregateFieldOffset(target.type, expr.field);
        return field ? { name: target.name, offset: target.offset + field.offset, type: field.type } : null;
    }
    return null;
}
function getAggregateFieldOffset(type, name) {
    let offset = 0;
    for (const field of (0, tsFrontendSemantic_1.getAggregateLayoutFields)(type)) {
        if (field.name === name) {
            return { offset, type: field.type };
        }
        if (type.aggregateKind === "struct") {
            offset += field.size;
        }
    }
    return null;
}
function initializerConstValue(label, initializer) {
    if (!initializer) {
        return 0;
    }
    if (initializer.kind === "expr" && initializer.expr.kind === "const") {
        return initializer.expr.value;
    }
    if (initializer.kind === "list" && initializer.items.length === 0) {
        return 0;
    }
    if (initializer.kind === "list" && initializer.items.length === 1 && initializer.items[0]?.kind === "expr" && initializer.items[0].expr.kind === "const") {
        return initializer.items[0].expr.value;
    }
    throw new Error(`Global initializer for '${label}' must be a constant expression.`);
}
function scalarInitializerBytes(width, value) {
    if (width === 1) {
        return [`${value & 0xff}`];
    }
    return [`${value & 0xff}`, `${(value >> 8) & 0xff}`];
}
function lowerFunction(fn, externs, definedFunctions, sourceText, state, file) {
    const functionState = {
        baseLocalCount: fn.locals.length,
        tempLocals: [],
        paramSlotBase: fn.returnType.kind === "aggregate" ? 1 : 0,
        returnType: fn.returnType,
    };
    const body = lowerBlock(fn.body, externs, definedFunctions, sourceText, state, functionState, file);
    const functionIr = {
        name: fn.name,
        params: [...(fn.returnType.kind === "aggregate" ? [2] : []), ...fn.params.map((param) => getParamWidth(param))],
        locals: [...fn.locals.map((local) => local.storageBytes), ...functionState.tempLocals],
        body,
    };
    return (0, tsProgram_1.lowerFunctionIR)(functionIr);
}
function lowerBlock(block, externs, definedFunctions, sourceText, state, functionState, file) {
    return block.statements.map((stmt) => lowerStmt(stmt, externs, definedFunctions, sourceText, state, functionState, file));
}
function lowerStmt(stmt, externs, definedFunctions, sourceText, state, functionState, file) {
    switch (stmt.kind) {
        case "return":
            if (functionState.returnType.kind === "aggregate") {
                if (!isAggregateCallArg(stmt.expr)) {
                    throw new Error("Internal lowering error: aggregate-returning function expected aggregate return expr.");
                }
                return {
                    kind: "ifExprZero",
                    expr: { kind: "const", value: 1 },
                    thenBody: [
                        ...lowerAggregateReturnToReturnSlot(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
                        { kind: "returnVoid" },
                    ],
                    elseBody: [],
                };
            }
            return { kind: "returnExpr", expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file) };
        case "returnVoid":
            return { kind: "returnVoid" };
        case "expr":
            return { kind: "evalExpr", expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file) };
        case "if":
            return {
                kind: "ifExprZero",
                expr: lowerExpr(stmt.condition, externs, definedFunctions, sourceText, state, functionState, file),
                thenBody: lowerBlock(stmt.thenBlock, externs, definedFunctions, sourceText, state, functionState, file),
                elseBody: stmt.elseBlock ? lowerBlock(stmt.elseBlock, externs, definedFunctions, sourceText, state, functionState, file) : [],
            };
        case "while": {
            return {
                kind: "whileExprNonZero",
                expr: lowerExpr(stmt.condition, externs, definedFunctions, sourceText, state, functionState, file),
                body: lowerBlock(stmt.body, externs, definedFunctions, sourceText, state, functionState, file),
            };
        }
        case "doWhile":
            return {
                kind: "doWhileExprNonZero",
                body: lowerBlock(stmt.body, externs, definedFunctions, sourceText, state, functionState, file),
                expr: lowerExpr(stmt.condition, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "for":
            return lowerForStmt(stmt, externs, definedFunctions, sourceText, state, functionState, file);
        case "switch":
            externs.add(".eq");
            return {
                kind: "switchExpr",
                expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
                cases: stmt.cases.map((entry) => ({
                    value: entry.value,
                    body: lowerBlock(entry.body, externs, definedFunctions, sourceText, state, functionState, file),
                })),
                defaultBody: stmt.defaultCase ? lowerBlock(stmt.defaultCase, externs, definedFunctions, sourceText, state, functionState, file) : [],
            };
        case "assign": {
            const decLocal = tryLowerDecLocalByte(stmt);
            if (decLocal) {
                return decLocal;
            }
            if (stmt.expr.kind === "const") {
                return {
                    kind: "assignLocalConst",
                    slot: stmt.local.slot,
                    width: getLocalValueWidth(stmt.local),
                    value: stmt.expr.value,
                };
            }
            return {
                kind: "assignLocalExpr",
                slot: stmt.local.slot,
                width: getLocalValueWidth(stmt.local),
                expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
            };
        }
        case "aggregateAssign":
            return lowerAggregateAssignWrapper(stmt.target, stmt.source, externs, definedFunctions, sourceText, state, functionState, file);
        case "arrayAssign":
            if (stmt.target.kind === "param") {
                return lowerParamArrayAssign(stmt, externs, definedFunctions, sourceText, state, functionState, file);
            }
            if (stmt.index.kind === "const" && stmt.expr.kind === "const") {
                return {
                    kind: "assignLocalArrayConst",
                    slot: stmt.target.slot,
                    index: stmt.index.value,
                    value: stmt.expr.value,
                };
            }
            if (stmt.index.kind === "const") {
                return {
                    kind: "assignLocalArrayExpr",
                    slot: stmt.target.slot,
                    index: stmt.index.value,
                    expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
                };
            }
            return {
                kind: "assignLocalArrayDynamic",
                slot: stmt.target.slot,
                index: lowerExpr(stmt.index, externs, definedFunctions, sourceText, state, functionState, file),
                expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "break":
            return { kind: "break" };
        case "continue":
            return { kind: "continue" };
        default:
            return assertNever(stmt);
    }
}
function lowerForStmt(stmt, externs, definedFunctions, sourceText, state, functionState, file) {
    const loopBody = lowerBlock(stmt.body, externs, definedFunctions, sourceText, state, functionState, file);
    const init = stmt.initializer ? lowerForInit(stmt.initializer, externs, definedFunctions, sourceText, state, functionState, file) : undefined;
    const step = stmt.step ? lowerSimpleStmt(stmt.step, externs, definedFunctions, sourceText, state, functionState, file) : undefined;
    const loopStmt = {
        kind: "whileExprNonZero",
        expr: stmt.condition
            ? lowerExpr(stmt.condition, externs, definedFunctions, sourceText, state, functionState, file)
            : { kind: "const", value: 1 },
        body: loopBody,
        stepBody: step ? [step] : [],
    };
    if (!init || init.length === 0) {
        return loopStmt;
    }
    return {
        kind: "ifExprZero",
        expr: { kind: "const", value: 1 },
        thenBody: [...init, loopStmt],
        elseBody: [],
    };
}
function lowerForInit(init, externs, definedFunctions, sourceText, state, functionState, file) {
    if (init.kind !== "localDecl") {
        if (init.kind === "staticDecl") {
            return [];
        }
        return [lowerSimpleStmt(init, externs, definedFunctions, sourceText, state, functionState, file)];
    }
    const initStatements = init.initStatements?.map((stmt) => lowerSimpleStmt(stmt, externs, definedFunctions, sourceText, state, functionState, file)) ?? [];
    if (!init.initializer) {
        return initStatements.length > 0
            ? initStatements
            : [{ kind: "evalExpr", expr: { kind: "const", value: 0 } }];
    }
    const aggregateInitializer = init.initializer;
    if (aggregateInitializer.type.kind === "aggregate") {
        return [
            ...materializeAggregateProducer(aggregateInitializer, { kind: "localSlot", slot: init.local.slot, type: aggregateInitializer.type }, externs, definedFunctions, sourceText, state, functionState, file),
            ...initStatements,
        ];
    }
    if (init.initializer.kind === "const") {
        return [{
                kind: "assignLocalConst",
                slot: init.local.slot,
                width: getLocalValueWidth(init.local),
                value: init.initializer.value,
            }, ...initStatements];
    }
    return [{
            kind: "assignLocalExpr",
            slot: init.local.slot,
            width: getLocalValueWidth(init.local),
            expr: lowerExpr(init.initializer, externs, definedFunctions, sourceText, state, functionState, file),
        }, ...initStatements];
}
function lowerSimpleStmt(stmt, externs, definedFunctions, sourceText, state, functionState, file) {
    if (stmt.kind === "expr") {
        return { kind: "evalExpr", expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file) };
    }
    if (stmt.kind === "aggregateAssign") {
        return lowerAggregateAssignWrapper(stmt.target, stmt.source, externs, definedFunctions, sourceText, state, functionState, file);
    }
    if (stmt.kind === "arrayAssign") {
        if (stmt.target.kind === "param") {
            return lowerParamArrayAssign(stmt, externs, definedFunctions, sourceText, state, functionState, file);
        }
        if (stmt.index.kind === "const" && stmt.expr.kind === "const") {
            return {
                kind: "assignLocalArrayConst",
                slot: stmt.target.slot,
                index: stmt.index.value,
                value: stmt.expr.value,
            };
        }
        if (stmt.index.kind === "const") {
            return {
                kind: "assignLocalArrayExpr",
                slot: stmt.target.slot,
                index: stmt.index.value,
                expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
            };
        }
        return {
            kind: "assignLocalArrayDynamic",
            slot: stmt.target.slot,
            index: lowerExpr(stmt.index, externs, definedFunctions, sourceText, state, functionState, file),
            expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
        };
    }
    const decLocal = tryLowerDecLocalByte(stmt);
    if (decLocal) {
        return decLocal;
    }
    if (stmt.expr.kind === "const") {
        return {
            kind: "assignLocalConst",
            slot: stmt.local.slot,
            width: getLocalValueWidth(stmt.local),
            value: stmt.expr.value,
        };
    }
    return {
        kind: "assignLocalExpr",
        slot: stmt.local.slot,
        width: getLocalValueWidth(stmt.local),
        expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
    };
}
function lowerAggregateAssignWrapper(target, source, externs, definedFunctions, sourceText, state, functionState, file) {
    const aggregateTarget = target;
    const thenBody = materializeAggregateProducer(source, target.kind === "aggregateAddress"
        ? { kind: "pointer", pointer: lowerExpr(target.pointer, externs, definedFunctions, sourceText, state, functionState, file), type: target.type }
        : aggregateTarget.kind === "local"
            ? { kind: "localSlot", slot: aggregateTarget.slot, type: aggregateTarget.type }
            : { kind: "globalSymbol", name: aggregateTarget.name, type: aggregateTarget.type }, externs, definedFunctions, sourceText, state, functionState, file);
    return {
        kind: "ifExprZero",
        expr: { kind: "const", value: 1 },
        thenBody,
        elseBody: [],
    };
}
function lowerAggregateAssignToGlobal(targetName, targetType, source, externs, definedFunctions, sourceText, state, functionState, file) {
    return materializeAggregateProducer(source, { kind: "globalSymbol", name: targetName, type: targetType }, externs, definedFunctions, sourceText, state, functionState, file);
}
function lowerAggregateCopyLocalSlotToGlobal(sourceSlot, targetName, targetType) {
    return getAggregateFieldStores(targetType).map((field) => ({
        kind: "evalExpr",
        expr: {
            kind: field.width === 1 ? "assignDerefByte" : "assignDerefWord",
            pointer: {
                kind: "pointerAdd",
                pointer: { kind: "globalAddress", name: targetName },
                index: { kind: "const", value: field.offset },
                scale: 1,
            },
            expr: {
                kind: field.width === 1 ? "derefByte" : "derefWord",
                pointer: {
                    kind: "pointerAdd",
                    pointer: { kind: "localAddress", slot: sourceSlot },
                    index: { kind: "const", value: field.offset },
                    scale: 1,
                },
            },
        },
    }));
}
function lowerAggregateCopyLocalSlotToLocalSlot(sourceSlot, targetSlot, targetType) {
    return getAggregateFieldStores(targetType).map((field) => ({
        kind: "evalExpr",
        expr: {
            kind: field.width === 1 ? "assignDerefByte" : "assignDerefWord",
            pointer: {
                kind: "pointerAdd",
                pointer: { kind: "localAddress", slot: targetSlot },
                index: { kind: "const", value: field.offset },
                scale: 1,
            },
            expr: {
                kind: field.width === 1 ? "derefByte" : "derefWord",
                pointer: {
                    kind: "pointerAdd",
                    pointer: { kind: "localAddress", slot: sourceSlot },
                    index: { kind: "const", value: field.offset },
                    scale: 1,
                },
            },
        },
    }));
}
function lowerAggregateAssignToLocalSlot(targetSlot, targetType, source, externs, definedFunctions, sourceText, state, functionState, file) {
    if (targetType.kind !== "aggregate") {
        throw new Error("Internal lowering error: aggregate assignment expected aggregate local target.");
    }
    return materializeAggregateProducer(source, { kind: "localSlot", slot: targetSlot, type: targetType }, externs, definedFunctions, sourceText, state, functionState, file);
}
function materializeAggregateProducer(source, destination, externs, definedFunctions, sourceText, state, functionState, file) {
    const aggregateType = destination.type;
    switch (source.kind) {
        case "aggregateRef":
            return lowerAggregateSourceAddressToDestination(lowerAggregateSourceAddressExpr(source.symbol, functionState), source.symbol.type, destination);
        case "aggregateAddress":
            return lowerAggregateSourceAddressToDestination(lowerExpr(source.pointer, externs, definedFunctions, sourceText, state, functionState, file), source.type, destination);
        case "aggregateAssignExpr":
            return materializeAggregateAssignExprProducer(source, destination, externs, definedFunctions, sourceText, state, functionState, file);
        case "comma":
            return [
                { kind: "evalExpr", expr: lowerExpr(source.left, externs, definedFunctions, sourceText, state, functionState, file) },
                ...materializeAggregateProducer(source.right, destination, externs, definedFunctions, sourceText, state, functionState, file),
            ];
        case "conditional":
            return [{
                    kind: "ifExprZero",
                    expr: lowerExpr(source.condition, externs, definedFunctions, sourceText, state, functionState, file),
                    thenBody: materializeAggregateProducer(source.thenExpr, destination, externs, definedFunctions, sourceText, state, functionState, file),
                    elseBody: materializeAggregateProducer(source.elseExpr, destination, externs, definedFunctions, sourceText, state, functionState, file),
                }];
        case "call":
        case "indirectCall":
            if (destination.kind === "returnSlot") {
                // The hidden return pointer is stack-relative. Passing it to another aggregate
                // return call directly changes that offset while its argument is pushed.
                return materializeAggregateProducerViaTempLocal(source, aggregateType, destination, externs, definedFunctions, sourceText, state, functionState, file);
            }
            return [{
                    kind: "materializeAggregateProducer",
                    destination: lowerAggregateDestination(destination),
                    source: lowerAggregateProducerExpr(source, externs, definedFunctions, sourceText, state, functionState, file),
                }];
        default:
            return assertNever(source);
    }
}
function lowerAggregateDestination(destination) {
    switch (destination.kind) {
        case "localSlot":
            return { kind: "localSlot", slot: destination.slot, size: destination.type.size };
        case "globalSymbol":
            return { kind: "globalSymbol", name: destination.name, size: destination.type.size };
        case "pointer":
            return { kind: "pointer", pointer: destination.pointer, size: destination.type.size };
        case "returnSlot":
            return { kind: "returnSlot", size: destination.type.size };
        default:
            return assertNever(destination);
    }
}
function materializeAggregateProducerViaTempLocal(source, tempType, destination, externs, definedFunctions, sourceText, state, functionState, file) {
    const tempSlot = allocateTempLocal(functionState, tempType.size);
    return [
        ...materializeAggregateProducer(source, { kind: "localSlot", slot: tempSlot, type: tempType }, externs, definedFunctions, sourceText, state, functionState, file),
        ...copyAggregateLocalSlotToDestination(tempSlot, tempType, destination),
    ];
}
function materializeAggregateAssignExprProducer(source, destination, externs, definedFunctions, sourceText, state, functionState, file) {
    if (source.target.kind === "local") {
        return [
            ...materializeAggregateProducer(source.source, { kind: "localSlot", slot: source.target.slot, type: source.target.type }, externs, definedFunctions, sourceText, state, functionState, file),
            ...copyAggregateLocalSlotToDestination(source.target.slot, source.target.type, destination),
        ];
    }
    return materializeAggregateAssignExprViaTempLocal(source, destination, externs, definedFunctions, sourceText, state, functionState, file);
}
function materializeAggregateAssignExprViaTempLocal(source, destination, externs, definedFunctions, sourceText, state, functionState, file) {
    const tempSlot = allocateTempLocal(functionState, source.type.size);
    return [
        ...materializeAggregateProducer(source.source, { kind: "localSlot", slot: tempSlot, type: source.target.type }, externs, definedFunctions, sourceText, state, functionState, file),
        ...lowerAggregateCopyLocalSlotToGlobal(tempSlot, source.target.name, source.target.type),
        ...copyAggregateLocalSlotToDestination(tempSlot, source.target.type, destination),
    ];
}
function lowerAggregateSourceAddressToDestination(sourcePointer, sourceType, destination) {
    switch (destination.kind) {
        case "localSlot":
            return lowerAggregateCopySourceAddressToLocalSlot(sourcePointer, destination.slot, destination.type);
        case "globalSymbol":
            return lowerAggregateCopySourceAddressToGlobal(sourcePointer, destination.name, destination.type);
        case "pointer":
            return lowerAggregateCopySourceAddressToPointer(sourcePointer, destination.pointer, destination.type);
        case "returnSlot":
            return lowerAggregateCopySourceAddressToReturnSlot(sourcePointer, sourceType.size);
        default:
            return assertNever(destination);
    }
}
function copyAggregateLocalSlotToDestination(sourceSlot, sourceType, destination) {
    switch (destination.kind) {
        case "localSlot":
            return destination.slot === sourceSlot ? [] : lowerAggregateCopyLocalSlotToLocalSlot(sourceSlot, destination.slot, destination.type);
        case "globalSymbol":
            return lowerAggregateCopyLocalSlotToGlobal(sourceSlot, destination.name, destination.type);
        case "pointer":
            return lowerAggregateCopySourceAddressToPointer({ kind: "localAddress", slot: sourceSlot }, destination.pointer, destination.type);
        case "returnSlot":
            return lowerAggregateCopyLocalToReturnSlot(sourceSlot, sourceType.size);
        default:
            return assertNever(destination);
    }
}
function lowerAggregateCopySourceAddressToLocalSlot(sourcePointer, targetSlot, targetType) {
    const aggregateType = targetType;
    return getAggregateFieldStores(aggregateType).map((field) => ({
        kind: "evalExpr",
        expr: {
            kind: field.width === 1 ? "assignDerefByte" : "assignDerefWord",
            pointer: {
                kind: "pointerAdd",
                pointer: { kind: "localAddress", slot: targetSlot },
                index: { kind: "const", value: field.offset },
                scale: 1,
            },
            expr: {
                kind: field.width === 1 ? "derefByte" : "derefWord",
                pointer: {
                    kind: "pointerAdd",
                    pointer: sourcePointer,
                    index: { kind: "const", value: field.offset },
                    scale: 1,
                },
            },
        },
    }));
}
function lowerAggregateCopySourceAddressToGlobal(sourcePointer, targetName, targetType) {
    return getAggregateFieldStores(targetType).map((field) => ({
        kind: "evalExpr",
        expr: {
            kind: field.width === 1 ? "assignDerefByte" : "assignDerefWord",
            pointer: {
                kind: "pointerAdd",
                pointer: { kind: "globalAddress", name: targetName },
                index: { kind: "const", value: field.offset },
                scale: 1,
            },
            expr: {
                kind: field.width === 1 ? "derefByte" : "derefWord",
                pointer: {
                    kind: "pointerAdd",
                    pointer: sourcePointer,
                    index: { kind: "const", value: field.offset },
                    scale: 1,
                },
            },
        },
    }));
}
function lowerAggregateCopySourceAddressToPointer(sourcePointer, targetPointer, targetType) {
    return getAggregateFieldStores(targetType).map((field) => ({
        kind: "evalExpr",
        expr: {
            kind: field.width === 1 ? "assignDerefByte" : "assignDerefWord",
            pointer: {
                kind: "pointerAdd",
                pointer: targetPointer,
                index: { kind: "const", value: field.offset },
                scale: 1,
            },
            expr: {
                kind: field.width === 1 ? "derefByte" : "derefWord",
                pointer: {
                    kind: "pointerAdd",
                    pointer: sourcePointer,
                    index: { kind: "const", value: field.offset },
                    scale: 1,
                },
            },
        },
    }));
}
function lowerAggregateCopySourceAddressToReturnSlot(sourcePointer, size) {
    return Array.from({ length: size }, (_, index) => ({
        kind: "evalExpr",
        expr: {
            kind: "assignDerefByte",
            pointer: {
                kind: "pointerAdd",
                pointer: { kind: "ref", scope: "arg", width: 2, slot: 0 },
                index: { kind: "const", value: index },
                scale: 1,
            },
            expr: {
                kind: "derefByte",
                pointer: {
                    kind: "pointerAdd",
                    pointer: sourcePointer,
                    index: { kind: "const", value: index },
                    scale: 1,
                },
            },
        },
    }));
}
function lowerAggregateCallIntoLocalSlot(targetSlot, source, externs, definedFunctions, sourceText, state, functionState, file) {
    return {
        kind: "evalExpr",
        expr: source.kind === "call"
            ? {
                kind: "call",
                target: source.target.name,
                args: [
                    { kind: "expr", expr: { kind: "localAddress", slot: targetSlot } },
                    ...source.args.map((arg) => isAggregateCallArg(arg)
                        ? {
                            kind: "aggregateConsumer",
                            consumer: {
                                kind: "addressArg",
                                source: lowerAggregateProducerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                                tempSlot: allocateTempLocal(functionState, arg.type.size),
                            },
                        }
                        : {
                            kind: "expr",
                            expr: lowerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                        }),
                ],
            }
            : {
                kind: "indirectCall",
                target: lowerExpr(source.target, externs, definedFunctions, sourceText, state, functionState, file),
                args: [
                    { kind: "expr", expr: { kind: "localAddress", slot: targetSlot } },
                    ...source.args.map((arg) => isAggregateCallArg(arg)
                        ? {
                            kind: "aggregateConsumer",
                            consumer: {
                                kind: "addressArg",
                                source: lowerAggregateProducerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                                tempSlot: allocateTempLocal(functionState, arg.type.size),
                            },
                        }
                        : {
                            kind: "expr",
                            expr: lowerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                        }),
                ],
            },
    };
}
function lowerAggregateCopyLocalToReturnSlot(sourceSlot, size) {
    return Array.from({ length: size }, (_, index) => ({
        kind: "evalExpr",
        expr: {
            kind: "assignDerefByte",
            pointer: {
                kind: "pointerAdd",
                pointer: { kind: "ref", scope: "arg", width: 2, slot: 0 },
                index: { kind: "const", value: index },
                scale: 1,
            },
            expr: {
                kind: "derefByte",
                pointer: {
                    kind: "pointerAdd",
                    pointer: { kind: "localAddress", slot: sourceSlot },
                    index: { kind: "const", value: index },
                    scale: 1,
                },
            },
        },
    }));
}
function lowerAggregateCopyArgAddressToReturnSlot(sourceSlot, size) {
    return Array.from({ length: size }, (_, index) => ({
        kind: "evalExpr",
        expr: {
            kind: "assignDerefByte",
            pointer: {
                kind: "pointerAdd",
                pointer: { kind: "ref", scope: "arg", width: 2, slot: 0 },
                index: { kind: "const", value: index },
                scale: 1,
            },
            expr: {
                kind: "derefByte",
                pointer: {
                    kind: "pointerAdd",
                    pointer: { kind: "ref", scope: "arg", width: 2, slot: sourceSlot },
                    index: { kind: "const", value: index },
                    scale: 1,
                },
            },
        },
    }));
}
function lowerAggregateCopyGlobalToReturnSlot(sourceName, size) {
    return Array.from({ length: size }, (_, index) => ({
        kind: "evalExpr",
        expr: {
            kind: "assignDerefByte",
            pointer: {
                kind: "pointerAdd",
                pointer: { kind: "ref", scope: "arg", width: 2, slot: 0 },
                index: { kind: "const", value: index },
                scale: 1,
            },
            expr: {
                kind: "derefByte",
                pointer: {
                    kind: "pointerAdd",
                    pointer: { kind: "globalAddress", name: sourceName },
                    index: { kind: "const", value: index },
                    scale: 1,
                },
            },
        },
    }));
}
function lowerAggregateReturnToReturnSlot(source, externs, definedFunctions, sourceText, state, functionState, file) {
    return materializeAggregateProducer(source, { kind: "returnSlot", type: functionState.returnType }, externs, definedFunctions, sourceText, state, functionState, file);
}
function getAggregateFieldStores(type) {
    if (type.kind !== "aggregate") {
        throw new Error("Internal lowering error: expected aggregate type.");
    }
    const key = `${type.aggregateKind}:${type.name}`;
    switch (key) {
        default:
            return Array.from({ length: type.size }, (_, index) => ({ offset: index, width: 1 }));
    }
}
function tryLowerDecLocalByte(stmt) {
    if (stmt.local.type.kind !== "scalar"
        || stmt.local.type.width !== 1
        || stmt.expr.kind !== "additive"
        || stmt.expr.op !== "-"
        || stmt.expr.right.kind !== "const"
        || stmt.expr.right.value !== 1) {
        return null;
    }
    if (stmt.expr.left.kind !== "ref" || stmt.expr.left.symbol.kind !== "local" || stmt.expr.left.symbol.slot !== stmt.local.slot) {
        return null;
    }
    return {
        kind: "decLocalByte",
        slot: stmt.local.slot,
    };
}
function getScalarLocalWidth(local) {
    if (local.type.kind !== "scalar") {
        throw new Error(`Internal lowering error: expected scalar local, got ${JSON.stringify(local.type)}`);
    }
    return local.type.width;
}
function getLocalValueWidth(local) {
    if (local.type.kind === "void" || local.type.kind === "array" || local.type.kind === "aggregate") {
        throw new Error(`Internal lowering error: expected scalar/pointer local, got ${JSON.stringify(local.type)}`);
    }
    return local.type.width;
}
function getParamWidth(param) {
    if (param.type.kind === "array") {
        return 2;
    }
    if (param.type.kind === "aggregate") {
        return 2;
    }
    if (param.type.kind === "void") {
        throw new Error(`Internal lowering error: expected non-void param, got ${JSON.stringify(param.type)}`);
    }
    return param.type.width;
}
function lowerParamArrayAssign(stmt, externs, definedFunctions, sourceText, state, functionState, file) {
    if (stmt.target.kind !== "param") {
        throw new Error("Internal lowering error: expected parameter array target.");
    }
    return {
        kind: "assignArgArrayDynamic",
        slot: stmt.target.slot,
        index: lowerExpr(stmt.index, externs, definedFunctions, sourceText, state, functionState, file),
        expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
    };
}
function lowerExpr(expr, externs, definedFunctions, sourceText, state, functionState, file) {
    switch (expr.kind) {
        case "const":
            return { kind: "const", value: expr.value };
        case "string":
            return { kind: "dataAddress", label: internStringLiteral(state, expr.value) };
        case "functionAddress":
            return { kind: "dataAddress", label: expr.name };
        case "ref":
            return {
                kind: "ref",
                scope: expr.symbol.kind === "local" ? "local" : "arg",
                width: expr.symbol.kind === "local"
                    ? getLocalValueWidth(expr.symbol)
                    : expr.type.kind === "pointer"
                        ? expr.type.width
                        : expr.symbol.type.kind === "array"
                            ? 2
                            : expr.symbol.type.kind === "aggregate"
                                ? (() => {
                                    throw new Error(`Internal lowering error: aggregate parameter values are not supported, got ${JSON.stringify(expr.symbol.type)}`);
                                })()
                                : expr.symbol.type.kind === "void"
                                    ? (() => {
                                        throw new Error(`Internal lowering error: void parameter values are not supported, got ${JSON.stringify(expr.symbol.type)}`);
                                    })()
                                    : expr.symbol.type.kind === "functionPointer"
                                        ? expr.symbol.type.width
                                        : expr.symbol.type.width,
                slot: expr.symbol.kind === "local" ? expr.symbol.slot : getParamIrSlot(expr.symbol.slot, functionState),
            };
        case "globalRef":
            if (expr.symbol.isExtern) {
                externs.add(expr.symbol.name);
            }
            return {
                kind: "globalRef",
                name: expr.symbol.name,
                width: expr.type.width,
            };
        case "localAddress":
            return {
                kind: "localAddress",
                slot: expr.symbol.slot,
            };
        case "globalAddress":
            if (expr.symbol.isExtern) {
                externs.add(expr.symbol.name);
            }
            return {
                kind: "globalAddress",
                name: expr.symbol.name,
            };
        case "aggregateFieldAccess":
            return {
                kind: expr.type.width === 1 ? "derefByte" : "derefWord",
                pointer: {
                    kind: "pointerAdd",
                    pointer: expr.symbol.kind === "local"
                        ? { kind: "localAddress", slot: expr.symbol.slot }
                        : expr.symbol.kind === "global"
                            ? { kind: "globalAddress", name: expr.symbol.name }
                            : { kind: "ref", scope: "arg", width: 2, slot: getParamIrSlot(expr.symbol.slot, functionState) },
                    index: { kind: "const", value: expr.offset },
                    scale: 1,
                },
            };
        case "aggregateProducerFieldRead": {
            return {
                kind: "aggregateConsumer",
                consumer: lowerAggregateFieldReadConsumer(expr.source, expr.offset, expr.type.width, externs, definedFunctions, sourceText, state, functionState, file),
            };
        }
        case "aggregateProducerFieldAddress": {
            return {
                kind: "aggregateConsumer",
                consumer: lowerAggregateFieldAddressConsumer(expr.source, expr.offset, externs, definedFunctions, sourceText, state, functionState, file),
            };
        }
        case "pointerAdd":
            return {
                kind: "pointerAdd",
                pointer: lowerExpr(expr.pointer, externs, definedFunctions, sourceText, state, functionState, file),
                index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
                scale: getPointerPointeeBytes(expr.pointee),
            };
        case "arrayElementAddress": {
            let pointer = lowerExpr(expr.base, externs, definedFunctions, sourceText, state, functionState, file);
            for (let position = 0; position < expr.indices.length; position += 1) {
                pointer = {
                    kind: "pointerAdd",
                    pointer,
                    index: lowerExpr(expr.indices[position], externs, definedFunctions, sourceText, state, functionState, file),
                    scale: expr.scales[position],
                };
            }
            return pointer;
        }
        case "deref":
            return {
                kind: expr.type.width === 1 ? "derefByte" : "derefWord",
                pointer: lowerExpr(expr.pointer, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "derefAssign":
            return {
                kind: expr.type.width === 1 ? "assignDerefByte" : "assignDerefWord",
                pointer: lowerExpr(expr.pointer, externs, definedFunctions, sourceText, state, functionState, file),
                expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "localArrayElement":
            if (expr.type.width === 2) {
                return {
                    kind: "derefWord",
                    pointer: {
                        kind: "pointerAdd",
                        pointer: { kind: "localAddress", slot: expr.symbol.slot },
                        index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
                        scale: 2,
                    },
                };
            }
            return {
                kind: "localArrayElement",
                slot: expr.symbol.slot,
                index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "paramArrayElement":
            if (expr.type.width === 2) {
                return {
                    kind: "derefWord",
                    pointer: {
                        kind: "pointerAdd",
                        pointer: { kind: "ref", scope: "arg", width: 2, slot: getParamIrSlot(expr.symbol.slot, functionState) },
                        index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
                        scale: 2,
                    },
                };
            }
            return {
                kind: "argArrayElement",
                slot: getParamIrSlot(expr.symbol.slot, functionState),
                index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "globalArrayElement":
            if (expr.type.width === 2) {
                return {
                    kind: "derefWord",
                    pointer: {
                        kind: "pointerAdd",
                        pointer: { kind: "globalAddress", name: expr.symbol.name },
                        index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
                        scale: 2,
                    },
                };
            }
            return {
                kind: "globalArrayElement",
                name: expr.symbol.name,
                index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "compare": {
            const helper = compareOpToHelper(expr.op);
            externs.add(helper);
            return {
                kind: "compare",
                left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
                right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
                helper,
            };
        }
        case "logical":
            return {
                kind: "logical",
                left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
                right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
                op: expr.op,
            };
        case "bitwise":
            return {
                kind: "bitwise",
                left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
                right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
                op: expr.op,
            };
        case "shift": {
            const helper = expr.op === "<<" ? ".asl" : ".asr";
            externs.add(helper);
            return {
                kind: "helperBinary",
                left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
                right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
                helper,
            };
        }
        case "call":
            if (expr.target.kind === "extern" || !definedFunctions.has(expr.target.name)) {
                externs.add(expr.target.name);
            }
            return {
                kind: "call",
                target: expr.target.name,
                args: expr.args.map((arg) => isAggregateCallArg(arg)
                    ? {
                        kind: "aggregateConsumer",
                        consumer: {
                            kind: "addressArg",
                            source: lowerAggregateProducerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                            tempSlot: allocateTempLocal(functionState, arg.type.size),
                        },
                    }
                    : {
                        kind: "expr",
                        expr: lowerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                    }),
            };
        case "indirectCall":
            return {
                kind: "indirectCall",
                target: lowerExpr(expr.target, externs, definedFunctions, sourceText, state, functionState, file),
                args: expr.args.map((arg) => isAggregateCallArg(arg)
                    ? {
                        kind: "aggregateConsumer",
                        consumer: {
                            kind: "addressArg",
                            source: lowerAggregateProducerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                            tempSlot: allocateTempLocal(functionState, arg.type.size),
                        },
                    }
                    : {
                        kind: "expr",
                        expr: lowerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                    }),
            };
        case "preIncDec":
            return {
                kind: "incDecLocal",
                slot: expr.local.slot,
                width: getLocalValueWidth(expr.local),
                step: expr.local.type.kind === "pointer" && expr.local.type.pointee === "int" ? 2 : 1,
                op: expr.op,
                mode: "prefix",
            };
        case "postIncDec":
            return {
                kind: "incDecLocal",
                slot: expr.local.slot,
                width: getLocalValueWidth(expr.local),
                step: expr.local.type.kind === "pointer" && expr.local.type.pointee === "int" ? 2 : 1,
                op: expr.op,
                mode: "postfix",
            };
        case "preArrayIncDec":
            return {
                kind: expr.target.kind === "param" ? "incDecArgArray" : "incDecLocalArray",
                slot: expr.target.slot,
                index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
                op: expr.op,
                mode: "prefix",
            };
        case "postArrayIncDec":
            return {
                kind: expr.target.kind === "param" ? "incDecArgArray" : "incDecLocalArray",
                slot: expr.target.slot,
                index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
                op: expr.op,
                mode: "postfix",
            };
        case "derefIncDec":
            return {
                kind: "incDecDeref",
                pointer: lowerExpr(expr.pointer, externs, definedFunctions, sourceText, state, functionState, file),
                width: expr.type.width,
                op: expr.op,
                mode: expr.mode,
            };
        case "assign":
            return {
                kind: "assignLocal",
                slot: expr.local.slot,
                width: getLocalValueWidth(expr.local),
                expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "assignGlobal":
            return {
                kind: "assignGlobal",
                name: expr.global.name,
                width: expr.type.width,
                expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "arrayAssignExpr":
            return {
                kind: expr.target.kind === "param" ? "assignArgArray" : "assignLocalArray",
                slot: expr.target.slot,
                index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
                expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "globalArrayAssignExpr":
            return {
                kind: "assignGlobalArray",
                name: expr.target.name,
                index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
                expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "cast":
            if (expr.type.kind === "scalar" && expr.type.width === 1) {
                const tempSlot = allocateTempLocal(functionState, 1);
                return {
                    kind: "comma",
                    left: {
                        kind: "assignLocal",
                        slot: tempSlot,
                        width: 1,
                        expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
                    },
                    right: {
                        kind: "ref",
                        scope: "local",
                        width: 1,
                        slot: tempSlot,
                    },
                };
            }
            return lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file);
        case "comma":
            return {
                kind: "comma",
                left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
                right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "conditional":
            return {
                kind: "conditional",
                condition: lowerExpr(expr.condition, externs, definedFunctions, sourceText, state, functionState, file),
                thenExpr: lowerExpr(expr.thenExpr, externs, definedFunctions, sourceText, state, functionState, file),
                elseExpr: lowerExpr(expr.elseExpr, externs, definedFunctions, sourceText, state, functionState, file),
            };
        case "additive":
            return {
                kind: "additive",
                left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
                right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
                op: expr.op,
            };
        case "multiplicative":
            if (expr.op === "*") {
                externs.add(".mul");
                return {
                    kind: "helperBinary",
                    left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
                    right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
                    helper: ".mul",
                };
            }
            externs.add(".div");
            return {
                kind: "divmod",
                left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
                right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
                result: expr.op === "/" ? "quotient" : "remainder",
            };
        default:
            return assertNever(expr);
    }
}
function getArrayPointerElementBytes(type) {
    if (!type.elementValueType) {
        return type.elementType === "char" ? 1 : 2;
    }
    return type.elementValueType.kind === "aggregate"
        ? (0, tsFrontendSemantic_1.getAggregateLayoutSize)(type.elementValueType)
        : 2;
}
function getPointerPointeeBytes(type) {
    if (type === "char") {
        return 1;
    }
    if (type === "int") {
        return 2;
    }
    if (type.kind === "arrayPointer") {
        return type.length * getArrayPointerElementBytes(type);
    }
    if (type.kind === "aggregate") {
        return (0, tsFrontendSemantic_1.getAggregateLayoutSize)(type);
    }
    return 2;
}
function lowerAggregateProducerExpr(expr, externs, definedFunctions, sourceText, state, functionState, file) {
    switch (expr.kind) {
        case "aggregateRef":
            return expr.symbol.kind === "global"
                ? {
                    kind: "aggregateRef",
                    scope: "global",
                    slot: expr.symbol.name,
                    size: expr.type.size,
                }
                : {
                    kind: "aggregateRef",
                    scope: expr.symbol.kind === "local" ? "local" : "arg",
                    slot: expr.symbol.kind === "local" ? expr.symbol.slot : getParamIrSlot(expr.symbol.slot, functionState),
                    size: expr.type.size,
                };
        case "aggregateAddress":
            return {
                kind: "aggregateAddress",
                pointer: lowerExpr(expr.pointer, externs, definedFunctions, sourceText, state, functionState, file),
                size: expr.type.size,
            };
        case "aggregateAssignExpr":
            return {
                kind: "aggregateAssignExpr",
                effectDestination: expr.target.kind === "local"
                    ? { kind: "localSlot", slot: expr.target.slot, size: expr.type.size }
                    : { kind: "globalSymbol", name: expr.target.name, size: expr.type.size },
                valueDestination: {
                    kind: "localSlot",
                    slot: expr.target.kind === "local" ? expr.target.slot : allocateTempLocal(functionState, expr.type.size),
                    size: expr.type.size,
                },
                source: lowerAggregateProducerExpr(expr.source, externs, definedFunctions, sourceText, state, functionState, file),
                size: expr.type.size,
            };
        case "call":
            return {
                kind: "call",
                target: expr.target.name,
                args: expr.args.map((arg) => isAggregateCallArg(arg)
                    ? {
                        kind: "aggregateConsumer",
                        consumer: {
                            kind: "addressArg",
                            source: lowerAggregateProducerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                            tempSlot: allocateTempLocal(functionState, arg.type.size),
                        },
                    }
                    : {
                        kind: "expr",
                        expr: lowerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                    }),
                size: expr.type.size,
            };
        case "indirectCall":
            return {
                kind: "indirectCall",
                target: lowerExpr(expr.target, externs, definedFunctions, sourceText, state, functionState, file),
                args: expr.args.map((arg) => isAggregateCallArg(arg)
                    ? {
                        kind: "aggregateConsumer",
                        consumer: {
                            kind: "addressArg",
                            source: lowerAggregateProducerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                            tempSlot: allocateTempLocal(functionState, arg.type.size),
                        },
                    }
                    : {
                        kind: "expr",
                        expr: lowerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                    }),
                size: expr.type.size,
            };
        case "comma":
            return {
                kind: "comma",
                left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
                right: lowerAggregateProducerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
                size: expr.type.size,
            };
        case "conditional":
            return {
                kind: "conditional",
                condition: lowerExpr(expr.condition, externs, definedFunctions, sourceText, state, functionState, file),
                thenExpr: lowerAggregateProducerExpr(expr.thenExpr, externs, definedFunctions, sourceText, state, functionState, file),
                elseExpr: lowerAggregateProducerExpr(expr.elseExpr, externs, definedFunctions, sourceText, state, functionState, file),
                size: expr.type.size,
            };
        default:
            return assertNever(expr);
    }
}
function aggregateProducerNeedsFieldConsumerTemp(source) {
    switch (source.kind) {
        case "aggregateRef":
        case "aggregateAddress":
        case "aggregateAssignExpr":
            return false;
        case "call":
        case "indirectCall":
            return true;
        case "comma":
            return aggregateProducerNeedsFieldConsumerTemp(source.right);
        case "conditional":
            return aggregateProducerNeedsFieldConsumerTemp(source.thenExpr)
                || aggregateProducerNeedsFieldConsumerTemp(source.elseExpr);
    }
}
function lowerAggregateFieldReadConsumer(sourceExpr, offset, width, externs, definedFunctions, sourceText, state, functionState, file) {
    const source = lowerAggregateProducerExpr(sourceExpr, externs, definedFunctions, sourceText, state, functionState, file);
    return {
        kind: "fieldRead",
        source,
        tempSlot: aggregateProducerNeedsFieldConsumerTemp(source)
            ? allocateTempLocal(functionState, sourceExpr.type.size)
            : undefined,
        offset,
        width,
    };
}
function lowerAggregateFieldAddressConsumer(sourceExpr, offset, externs, definedFunctions, sourceText, state, functionState, file) {
    const source = lowerAggregateProducerExpr(sourceExpr, externs, definedFunctions, sourceText, state, functionState, file);
    return {
        kind: "fieldAddress",
        source,
        tempSlot: aggregateProducerNeedsFieldConsumerTemp(source)
            ? allocateTempLocal(functionState, sourceExpr.type.size)
            : undefined,
        offset,
    };
}
function lowerAggregateSourceAddressExpr(symbol, functionState) {
    if (symbol.kind === "local") {
        return { kind: "localAddress", slot: symbol.slot };
    }
    if (symbol.kind === "param") {
        return { kind: "ref", scope: "arg", width: 2, slot: getParamIrSlot(symbol.slot, functionState) };
    }
    return { kind: "globalAddress", name: symbol.name };
}
function allocateTempLocal(state, size) {
    const slot = state.baseLocalCount + state.tempLocals.length;
    state.tempLocals.push(size);
    return slot;
}
function isAggregateCallArg(arg) {
    return "type" in arg && arg.type.kind === "aggregate";
}
function getParamIrSlot(slot, state) {
    return slot + state.paramSlotBase;
}
function internStringLiteral(state, value) {
    const label = `.str${state.nextStringId}`;
    state.nextStringId += 1;
    state.data.push({
        label,
        directive: ".ascii",
        value: encodeAsciiLiteral(value),
    });
    return label;
}
function encodeAsciiLiteral(value) {
    return JSON.stringify(value)
        .replace(/\u0000/g, "\\0");
}
function compareOpToHelper(op) {
    switch (op) {
        case "==":
            return ".eq";
        case "!=":
            return ".ne";
        case ">":
            return ".gt";
        case "<":
            return ".lt";
        case ">=":
            return ".ge";
        case "<=":
            return ".le";
        default:
            return assertNever(op);
    }
}
function assertNever(value) {
    throw new Error(`Unhandled lowering node: ${JSON.stringify(value)}`);
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitProgram = emitProgram;
exports.lowerFunctionIR = lowerFunctionIR;
function emitProgram(spec) {
    const lines = [];
    for (const exp of spec.exports ?? []) {
        lines.push(`\t.globl\t${exp}`);
    }
    for (const ext of spec.externs ?? []) {
        lines.push(`\t.globl\t${ext}`);
    }
    lines.push(`\t.module\t${spec.moduleName}`);
    lines.push("\t.area\t_CODE");
    for (const fn of spec.functions) {
        lines.push(...emitFunction(fn));
    }
    if (spec.data && spec.data.length > 0) {
        lines.push("\t.area\t_DATA");
        for (const item of spec.data) {
            lines.push(item.label
                ? `${item.label}:\t${item.directive}\t${item.value}`
                : `\t${item.directive}\t${item.value}`);
        }
    }
    if (spec.includeBss || (spec.bss && spec.bss.length > 0)) {
        lines.push("\t.area\t_BSS");
        for (const item of spec.bss ?? []) {
            lines.push(item.label
                ? `${item.label}:\t${item.directive}\t${item.value}`
                : `\t${item.directive}\t${item.value}`);
        }
    }
    lines.push("");
    return lines.join("\n");
}
function lowerFunctionIR(fn) {
    const layout = layoutFunction(fn);
    const state = { nextLabelId: 2, labelPrefix: fn.name };
    const statements = [];
    if (layout.localBytes > 0) {
        statements.push({ kind: "reserveBytes", count: layout.localBytes });
    }
    for (const stmt of fn.body) {
        statements.push(...lowerStmtIR(stmt, layout, state));
    }
    return { name: fn.name, statements };
}
function lowerStmtIR(stmt, layout, state, loop) {
    switch (stmt.kind) {
        case "materializeAggregateProducer":
            return [{
                    kind: "materializeAggregateProducer",
                    destination: lowerAggregateDestinationIR(stmt.destination, layout),
                    source: lowerAggregateProducerIR(stmt.source, layout),
                }];
        case "assignLocalConst": {
            const offset = getLocalOffset(layout, stmt.slot);
            return stmt.width === 1
                ? [{ kind: "storeImmToLocal", offset, value: stmt.value }]
                : [{ kind: "storeImm16ToLocal", offset, value: stmt.value }];
        }
        case "assignLocalExpr": {
            const offset = getLocalOffset(layout, stmt.slot);
            const expr = lowerExprIR(stmt.expr, layout);
            return stmt.width === 1
                ? [{ kind: "storeExprToLocalByte", offset, expr }]
                : [{ kind: "storeExprToLocalWord", offset, expr }];
        }
        case "assignLocalArrayConst":
            return [{ kind: "storeImmToLocal", offset: getLocalOffset(layout, stmt.slot) + stmt.index, value: stmt.value }];
        case "assignLocalArrayExpr":
            return [{
                    kind: "storeExprToLocalByte",
                    offset: getLocalOffset(layout, stmt.slot) + stmt.index,
                    expr: lowerExprIR(stmt.expr, layout),
                }];
        case "assignLocalArrayDynamic":
            return [{
                    kind: "storeExprToLocalArrayByte",
                    offset: getLocalOffset(layout, stmt.slot),
                    index: lowerExprIR(stmt.index, layout),
                    expr: lowerExprIR(stmt.expr, layout),
                }];
        case "assignArgArrayDynamic":
            return [{
                    kind: "storeExprToArgArrayByte",
                    offset: getParamOffset(layout, stmt.slot),
                    index: lowerExprIR(stmt.index, layout),
                    expr: lowerExprIR(stmt.expr, layout),
                }];
        case "compareReturn": {
            const statements = [{
                    kind: "compareExprHelper",
                    left: lowerExprIR(stmt.left, layout),
                    right: lowerExprIR(stmt.right, layout),
                    helper: stmt.helper,
                }];
            if (layout.localBytes > 0) {
                statements.push({ kind: "releaseBytes", count: layout.localBytes });
            }
            statements.push({ kind: "ret" });
            return statements;
        }
        case "returnExpr": {
            const statements = [{ kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) }];
            if (layout.localBytes > 0) {
                statements.push({ kind: "releaseBytes", count: layout.localBytes });
            }
            statements.push({ kind: "ret" });
            return statements;
        }
        case "evalExpr":
            return [{ kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) }];
        case "returnVoid": {
            const statements = [];
            if (layout.localBytes > 0) {
                statements.push({ kind: "releaseBytes", count: layout.localBytes });
            }
            statements.push({ kind: "ret" });
            return statements;
        }
        case "emitExprChar":
            return [
                { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
                { kind: "pushHlArg" },
                { kind: "callWithModeA", target: "outchar", mode: 1 },
                { kind: "popBc" },
            ];
        case "callModeAArg":
            return [
                { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
                { kind: "pushHlArg" },
                { kind: "callWithModeA", target: stmt.target, mode: stmt.mode },
                { kind: "popBc" },
            ];
        case "decLocalByte":
            return [{ kind: "decLocalByte", offset: getLocalOffset(layout, stmt.slot) }];
        case "emitChar":
            return [
                { kind: "loadConstHl", value: stmt.value },
                { kind: "pushHlArg" },
                { kind: "callWithModeA", target: "outchar", mode: 1 },
                { kind: "popBc" },
            ];
        case "whileExprNonZero": {
            const loopLabel = allocateNumericLabel(state);
            const continueLabel = allocateNumericLabel(state);
            const endLabel = allocateNumericLabel(state);
            const loopContext = { breakLabel: endLabel, continueLabel };
            return [
                { kind: "label", name: loopLabel },
                { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
                { kind: "truthJumpZero", target: endLabel },
                ...stmt.body.flatMap((entry) => lowerStmtIR(entry, layout, state, loopContext)),
                { kind: "label", name: continueLabel },
                ...(stmt.stepBody ?? []).flatMap((entry) => lowerStmtIR(entry, layout, state, loopContext)),
                { kind: "jump", target: loopLabel },
                { kind: "label", name: endLabel },
            ];
        }
        case "doWhileExprNonZero": {
            const loopLabel = allocateNumericLabel(state);
            const continueLabel = allocateNumericLabel(state);
            const endLabel = allocateNumericLabel(state);
            const loopContext = { breakLabel: endLabel, continueLabel };
            return [
                { kind: "label", name: loopLabel },
                ...stmt.body.flatMap((entry) => lowerStmtIR(entry, layout, state, loopContext)),
                { kind: "label", name: continueLabel },
                { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
                { kind: "truthJumpZero", target: endLabel },
                { kind: "jump", target: loopLabel },
                { kind: "label", name: endLabel },
            ];
        }
        case "switchExpr": {
            const endLabel = allocateNumericLabel(state);
            const defaultLabel = stmt.defaultBody.length > 0 ? allocateNumericLabel(state) : endLabel;
            const caseLabels = stmt.cases.map(() => allocateNumericLabel(state));
            const nextCompareLabels = stmt.cases.map((_, index) => index === stmt.cases.length - 1 ? defaultLabel : allocateNumericLabel(state));
            const switchContext = { breakLabel: endLabel };
            const dispatch = stmt.cases.flatMap((entry, index) => [
                {
                    kind: "compareExprHelper",
                    left: lowerExprIR(stmt.expr, layout),
                    right: { kind: "const", value: entry.value },
                    helper: ".eq",
                },
                { kind: "truthJumpZero", target: nextCompareLabels[index] },
                { kind: "jump", target: caseLabels[index] },
                ...(nextCompareLabels[index] === defaultLabel ? [] : [{ kind: "label", name: nextCompareLabels[index] }]),
            ]);
            const bodies = [];
            for (const [index, entry] of stmt.cases.entries()) {
                bodies.push({ kind: "label", name: caseLabels[index] });
                bodies.push(...entry.body.flatMap((bodyStmt) => lowerStmtIR(bodyStmt, layout, state, switchContext)));
            }
            if (stmt.defaultBody.length > 0) {
                bodies.push({ kind: "label", name: defaultLabel });
                bodies.push(...stmt.defaultBody.flatMap((bodyStmt) => lowerStmtIR(bodyStmt, layout, state, switchContext)));
            }
            bodies.push({ kind: "label", name: endLabel });
            return [...dispatch, ...bodies];
        }
        case "break":
            if (!loop) {
                throw new Error("Internal lowering error: break used outside loop context.");
            }
            return [{ kind: "jump", target: loop.breakLabel }];
        case "continue":
            if (!loop?.continueLabel) {
                throw new Error("Internal lowering error: continue used outside loop context.");
            }
            return [{ kind: "jump", target: loop.continueLabel }];
        case "ifExprZero": {
            const elseLabel = allocateNumericLabel(state);
            const endLabel = allocateNumericLabel(state);
            return [
                { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
                { kind: "truthJumpZero", target: elseLabel },
                ...stmt.thenBody.flatMap((entry) => lowerStmtIR(entry, layout, state, loop)),
                { kind: "jump", target: endLabel },
                { kind: "label", name: elseLabel },
                ...stmt.elseBody.flatMap((entry) => lowerStmtIR(entry, layout, state, loop)),
                { kind: "label", name: endLabel },
            ];
        }
        default:
            return assertNever(stmt);
    }
}
function allocateNumericLabel(state) {
    const label = `.${state.labelPrefix}_${state.nextLabelId}`;
    state.nextLabelId += 1;
    return label;
}
function lowerExprIR(expr, layout) {
    switch (expr.kind) {
        case "const":
            return { kind: "const", value: expr.value };
        case "dataAddress":
            return { kind: "dataAddress", label: expr.label };
        case "globalAddress":
            return { kind: "globalAddress", name: expr.name };
        case "variadicStartAddress":
            return { kind: "variadicStartAddress", offset: layout.variadicStartOffset };
        case "vaArg":
            return { kind: "vaArg", listOffset: getLocalOffset(layout, expr.listSlot), width: expr.width };
        case "localAddress":
            return { kind: "localAddress", offset: getLocalOffset(layout, expr.slot) };
        case "localArrayElement":
            if (expr.index.kind === "const") {
                return { kind: "localArrayElement", offset: getLocalOffset(layout, expr.slot) + expr.index.value };
            }
            return { kind: "localArrayElementExpr", offset: getLocalOffset(layout, expr.slot), index: lowerExprIR(expr.index, layout) };
        case "globalArrayElement":
            return { kind: "globalArrayElement", name: expr.name, index: lowerExprIR(expr.index, layout) };
        case "argArrayElement":
            return { kind: "argArrayElement", offset: getParamOffset(layout, expr.slot), index: lowerExprIR(expr.index, layout) };
        case "pointerAdd":
            return { kind: "pointerAdd", pointer: lowerExprIR(expr.pointer, layout), index: lowerExprIR(expr.index, layout), scale: expr.scale };
        case "derefByte":
            return { kind: "derefByte", pointer: lowerExprIR(expr.pointer, layout) };
        case "derefWord":
            return { kind: "derefWord", pointer: lowerExprIR(expr.pointer, layout) };
        case "assignDerefByte":
            return { kind: "assignDerefByte", pointer: lowerExprIR(expr.pointer, layout), expr: lowerExprIR(expr.expr, layout) };
        case "assignDerefWord":
            return { kind: "assignDerefWord", pointer: lowerExprIR(expr.pointer, layout), expr: lowerExprIR(expr.expr, layout) };
        case "incDecDeref":
            return { kind: "incDecDeref", pointer: lowerExprIR(expr.pointer, layout), width: expr.width, op: expr.op, mode: expr.mode };
        case "incDecLocal":
            return { kind: "incDecLocal", offset: getLocalOffset(layout, expr.slot), width: expr.width, step: expr.step, op: expr.op, mode: expr.mode };
        case "incDecLocalArray":
            return { kind: "incDecLocalArray", offset: getLocalOffset(layout, expr.slot), index: lowerExprIR(expr.index, layout), op: expr.op, mode: expr.mode };
        case "incDecArgArray":
            return { kind: "incDecArgArray", offset: getParamOffset(layout, expr.slot), index: lowerExprIR(expr.index, layout), op: expr.op, mode: expr.mode };
        case "assignLocal":
            return { kind: "assignLocal", offset: getLocalOffset(layout, expr.slot), width: expr.width, expr: lowerExprIR(expr.expr, layout) };
        case "assignGlobal":
            return { kind: "assignGlobal", name: expr.name, width: expr.width, expr: lowerExprIR(expr.expr, layout) };
        case "assignLocalArray":
            return { kind: "assignLocalArray", offset: getLocalOffset(layout, expr.slot), index: lowerExprIR(expr.index, layout), expr: lowerExprIR(expr.expr, layout) };
        case "assignGlobalArray":
            return { kind: "assignGlobalArray", name: expr.name, index: lowerExprIR(expr.index, layout), expr: lowerExprIR(expr.expr, layout) };
        case "assignArgArray":
            return { kind: "assignArgArray", offset: getParamOffset(layout, expr.slot), index: lowerExprIR(expr.index, layout), expr: lowerExprIR(expr.expr, layout) };
        case "comma":
            return { kind: "comma", left: lowerExprIR(expr.left, layout), right: lowerExprIR(expr.right, layout) };
        case "indirectCall":
            return {
                kind: "indirectCall",
                target: lowerExprIR(expr.target, layout),
                args: expr.args?.map((arg) => lowerCallArgIR(arg, layout)),
                ...(expr.isVariadic ? { isVariadic: true } : {}),
            };
        case "compare":
            return {
                kind: "compare",
                left: lowerExprIR(expr.left, layout),
                right: lowerExprIR(expr.right, layout),
                helper: expr.helper,
            };
        case "logical":
            return {
                kind: "logical",
                left: lowerExprIR(expr.left, layout),
                right: lowerExprIR(expr.right, layout),
                op: expr.op,
            };
        case "conditional":
            return {
                kind: "conditional",
                condition: lowerExprIR(expr.condition, layout),
                thenExpr: lowerExprIR(expr.thenExpr, layout),
                elseExpr: lowerExprIR(expr.elseExpr, layout),
            };
        case "bitwise":
            return {
                kind: "bitwise",
                left: lowerExprIR(expr.left, layout),
                right: lowerExprIR(expr.right, layout),
                op: expr.op,
            };
        case "helperBinary":
            return {
                kind: "helperBinary",
                left: lowerExprIR(expr.left, layout),
                right: lowerExprIR(expr.right, layout),
                helper: expr.helper,
            };
        case "divmod":
            return {
                kind: "divmod",
                left: lowerExprIR(expr.left, layout),
                right: lowerExprIR(expr.right, layout),
                result: expr.result,
            };
        case "additive":
            return {
                kind: "additive",
                left: lowerExprIR(expr.left, layout),
                right: lowerExprIR(expr.right, layout),
                op: expr.op,
            };
        case "aggregateConsumer":
            return {
                kind: "aggregateConsumer",
                consumer: lowerAggregateConsumerIR(expr.consumer, layout),
            };
        case "call":
            return {
                kind: "call",
                target: expr.target,
                args: expr.args?.map((arg) => lowerCallArgIR(arg, layout)),
                ...(expr.isVariadic ? { isVariadic: true } : {}),
            };
        case "ref":
            return lowerRefIR(expr, layout);
        case "globalRef":
            return { kind: "globalRef", name: expr.name, width: expr.width };
        default:
            return assertNever(expr);
    }
}
function lowerRefIR(ref, layout) {
    const offset = ref.scope === "local" ? getLocalOffset(layout, ref.slot) : getParamOffset(layout, ref.slot);
    if (ref.scope === "local") {
        return ref.width === 1 ? { kind: "localChar", offset } : { kind: "localInt", offset };
    }
    return ref.width === 1 ? { kind: "argChar", offset } : { kind: "argInt", offset };
}
function lowerAggregateProducerIR(expr, layout) {
    switch (expr.kind) {
        case "aggregateRef":
            return expr.scope === "global"
                ? {
                    kind: "aggregateRef",
                    scope: "global",
                    name: expr.slot,
                    size: expr.size,
                }
                : {
                    kind: "aggregateRef",
                    scope: expr.scope,
                    offset: expr.scope === "local" ? getLocalOffset(layout, expr.slot) : getParamOffset(layout, expr.slot),
                    size: expr.size,
                };
        case "aggregateAddress":
            return { kind: "aggregateAddress", pointer: lowerExprIR(expr.pointer, layout), size: expr.size };
        case "aggregateAssignExpr":
            return {
                kind: "aggregateAssignExpr",
                effectDestination: expr.effectDestination.kind === "localSlot"
                    ? { kind: "localSlot", offset: getLocalOffset(layout, expr.effectDestination.slot), size: expr.size }
                    : expr.effectDestination.kind === "globalSymbol"
                        ? { kind: "globalSymbol", name: expr.effectDestination.name, size: expr.size }
                        : { kind: "pointer", pointer: lowerExprIR(expr.effectDestination.pointer, layout), size: expr.size },
                valueDestination: { kind: "localSlot", offset: getLocalOffset(layout, expr.valueDestination.slot), size: expr.size },
                source: lowerAggregateProducerIR(expr.source, layout),
                size: expr.size,
            };
        case "indirectCall":
            return {
                kind: "indirectCall",
                target: lowerExprIR(expr.target, layout),
                args: expr.args?.map((arg) => lowerCallArgIR(arg, layout)),
                size: expr.size,
                ...(expr.isVariadic ? { isVariadic: true } : {}),
            };
        case "call":
            return {
                kind: "call",
                target: expr.target,
                args: expr.args?.map((arg) => lowerCallArgIR(arg, layout)),
                size: expr.size,
                ...(expr.isVariadic ? { isVariadic: true } : {}),
            };
        case "comma":
            return {
                kind: "comma",
                left: lowerExprIR(expr.left, layout),
                right: lowerAggregateProducerIR(expr.right, layout),
                size: expr.size,
            };
        case "conditional":
            return {
                kind: "conditional",
                condition: lowerExprIR(expr.condition, layout),
                thenExpr: lowerAggregateProducerIR(expr.thenExpr, layout),
                elseExpr: lowerAggregateProducerIR(expr.elseExpr, layout),
                size: expr.size,
            };
        default:
            return assertNever(expr);
    }
}
function lowerAggregateDestinationIR(destination, layout) {
    switch (destination.kind) {
        case "localSlot":
            return { kind: "localSlot", offset: getLocalOffset(layout, destination.slot), size: destination.size };
        case "globalSymbol":
            return destination;
        case "pointer":
            return { kind: "pointer", pointer: lowerExprIR(destination.pointer, layout), size: destination.size };
        case "returnSlot":
            return destination;
        default:
            return assertNever(destination);
    }
}
function lowerAggregateConsumerIR(consumer, layout) {
    switch (consumer.kind) {
        case "addressArg":
            return {
                kind: "addressArg",
                source: lowerAggregateProducerIR(consumer.source, layout),
                tempOffset: getLocalOffset(layout, consumer.tempSlot),
            };
        case "fieldRead":
            return {
                kind: "fieldRead",
                source: lowerAggregateProducerIR(consumer.source, layout),
                tempOffset: consumer.tempSlot !== undefined ? getLocalOffset(layout, consumer.tempSlot) : undefined,
                offset: consumer.offset,
                width: consumer.width,
            };
        case "fieldAddress":
            return {
                kind: "fieldAddress",
                source: lowerAggregateProducerIR(consumer.source, layout),
                tempOffset: consumer.tempSlot !== undefined ? getLocalOffset(layout, consumer.tempSlot) : undefined,
                offset: consumer.offset,
            };
        default:
            return assertNever(consumer);
    }
}
function lowerCallArgIR(arg, layout) {
    switch (arg.kind) {
        case "expr":
            return { kind: "expr", expr: lowerExprIR(arg.expr, layout) };
        case "aggregateConsumer":
            return { kind: "aggregateConsumer", consumer: lowerAggregateConsumerIR(arg.consumer, layout) };
        default:
            return assertNever(arg);
    }
}
function layoutFunction(fn) {
    const localOffsets = [];
    let localRunning = 0;
    for (const width of fn.locals) {
        localOffsets.push(localRunning);
        localRunning += width;
    }
    const localBytes = localRunning;
    const paramOffsets = [];
    let preceding = 0;
    for (let index = 0; index < fn.params.length; index += 1) {
        if (fn.isVariadic) {
            // Variadic calls push every slot right-to-left, so fixed parameters are
            // laid out in declaration order immediately after the return address.
            paramOffsets.push(localBytes + 2 + preceding);
            preceding += getParamStackBytes(fn.params[index]);
            continue;
        }
        let trailing = 0;
        for (let next = index + 1; next < fn.params.length; next += 1) {
            trailing += getParamStackBytes(fn.params[next]);
        }
        paramOffsets.push(localBytes + 2 + trailing);
    }
    return {
        localBytes,
        localOffsets,
        paramOffsets,
        variadicStartOffset: localBytes + 2 + fn.params.reduce((total, width) => total + getParamStackBytes(width), 0),
    };
}
function getParamStackBytes(_width) {
    return 2;
}
function getLocalOffset(layout, slot) {
    return layout.localOffsets[slot] ?? 0;
}
function getParamOffset(layout, slot) {
    return layout.paramOffsets[slot] ?? 0;
}
function emitFunction(fn) {
    const lines = [`${fn.name}:`];
    const ctx = {
        stackDelta: 0,
        labels: {
            nextLogicalLabelId: 2000,
            labelPrefix: fn.name,
        },
    };
    for (const statement of fn.statements) {
        lines.push(...emitStatement(statement, ctx));
    }
    return lines;
}
function emitStatement(statement, ctx) {
    switch (statement.kind) {
        case "materializeAggregateProducer":
            return materializeAggregateProducerToDestination(statement.source, statement.destination, ctx);
        case "call":
            return [`\tcall\t${statement.target}`];
        case "loadConstHl":
            return emitExprToHl({ kind: "const", value: statement.value }, ctx);
        case "loadDataAddressHl":
            return emitExprToHl({ kind: "dataAddress", label: statement.label }, ctx);
        case "loadExprHl":
            return emitExprToHl(statement.expr, ctx);
        case "pushExprArg":
            return emitPushArgs([{ kind: "expr", expr: statement.expr }], ctx);
        case "pushHlArg":
            return ["\tpush\thl"];
        case "popBc":
            return ["\tpop\tbc"];
        case "ret":
            return ["\tret"];
        case "callWithModeA":
            return [`\tld\ta,#${statement.mode}`, `\tcall\t${statement.target}`];
        case "truthJumpZero":
            return ["\tld\ta,h", "\tor\tl", `\tjp\tz,${statement.target}`];
        case "label":
            return [`${statement.name}:`];
        case "jump":
            return [`\tjp\t${statement.target}`];
        case "decSp":
            return emitReserveBytes(1);
        case "incSp":
            return emitReleaseBytes(1);
        case "reserveBytes":
            return emitReserveBytes(statement.count);
        case "releaseBytes":
            return emitReleaseBytes(statement.count);
        case "loadLocalAddrHl":
            return emitLoadStackAddrToHl(statement.offset, ctx);
        case "storeImmToLocal":
            return [...emitLoadStackAddrToHl(statement.offset, ctx), `\tld\t(hl),#${statement.value}`];
        case "storeExprToLocalByte":
            return emitStoreExprToLocalByte(statement.offset, statement.expr, ctx);
        case "storeExprToLocalArrayByte":
            return emitStoreExprToLocalArrayByte(statement.offset, statement.index, statement.expr, ctx);
        case "storeExprToArgArrayByte":
            return emitStoreExprToArgArrayByte(statement.offset, statement.index, statement.expr, ctx);
        case "loadLocalCharToHl":
            return emitExprToHl({ kind: "localChar", offset: statement.offset }, ctx);
        case "storeImm16ToLocal":
            return emitStoreImm16ToLocal(statement.offset, statement.value, ctx);
        case "storeExprToLocalWord":
            return emitStoreExprToLocalWord(statement.offset, statement.expr, ctx);
        case "loadLocalIntToHl":
            return emitExprToHl({ kind: "localInt", offset: statement.offset }, ctx);
        case "decLocalByte":
            return [...emitLoadStackAddrToHl(statement.offset, ctx), "\tdec\t(hl)"];
        case "compareExprHelper":
            return emitHelperCompare(statement.left, statement.right, statement.helper, ctx);
        default:
            return assertNever(statement);
    }
}
function emitExprToHl(expr, ctx) {
    switch (expr.kind) {
        case "const":
            return [`\tld\thl,#${expr.value}`];
        case "dataAddress":
            return [`\tld\thl,#${expr.label}+0`];
        case "globalAddress":
            return [`\tld\thl,#${expr.name}+0`];
        case "variadicStartAddress":
            return emitLoadStackAddrToHl(expr.offset, ctx);
        case "vaArg":
            return emitVaArgExpr(expr.listOffset, expr.width, ctx);
        case "localAddress":
            return emitLoadStackAddrToHl(expr.offset, ctx);
        case "localArrayElement":
            return emitLoadStackByteToHl(expr.offset, ctx);
        case "localArrayElementExpr":
            return emitLoadIndexedLocalByteToHl(expr.offset, expr.index, ctx);
        case "globalArrayElement":
            return emitLoadIndexedGlobalByteToHl(expr.name, expr.index, ctx);
        case "argArrayElement":
            return emitLoadIndexedArgByteToHl(expr.offset, expr.index, ctx);
        case "pointerAdd":
            return emitPointerAddExpr(expr.pointer, expr.index, expr.scale, ctx);
        case "derefByte":
            return emitDerefByteExpr(expr.pointer, ctx);
        case "derefWord":
            return emitDerefWordExpr(expr.pointer, ctx);
        case "assignDerefByte":
            return emitAssignDerefByteExpr(expr.pointer, expr.expr, ctx);
        case "assignDerefWord":
            return emitAssignDerefWordExpr(expr.pointer, expr.expr, ctx);
        case "incDecDeref":
            return expr.width === 1
                ? emitIncDecDerefByteExpr(expr.pointer, expr.op, expr.mode, ctx)
                : emitIncDecDerefWordExpr(expr.pointer, expr.op, expr.mode, ctx);
        case "incDecLocal":
            return expr.width === 1
                ? emitIncDecLocalByteExpr(expr.offset, expr.op, expr.mode, ctx)
                : emitIncDecLocalWordExpr(expr.offset, expr.step, expr.op, expr.mode, ctx);
        case "incDecLocalArray":
            return emitIncDecLocalArrayExpr(expr.offset, expr.index, expr.op, expr.mode, ctx);
        case "incDecArgArray":
            return emitIncDecArgArrayExpr(expr.offset, expr.index, expr.op, expr.mode, ctx);
        case "assignLocal":
            return expr.width === 1
                ? emitAssignLocalByteExpr(expr.offset, expr.expr, ctx)
                : emitAssignLocalWordExpr(expr.offset, expr.expr, ctx);
        case "assignGlobal":
            return expr.width === 1
                ? emitAssignGlobalByteExpr(expr.name, expr.expr, ctx)
                : emitAssignGlobalWordExpr(expr.name, expr.expr, ctx);
        case "assignLocalArray":
            return emitAssignLocalArrayExpr(expr.offset, expr.index, expr.expr, ctx);
        case "assignGlobalArray":
            return emitAssignGlobalArrayExpr(expr.name, expr.index, expr.expr, ctx);
        case "assignArgArray":
            return emitAssignArgArrayExpr(expr.offset, expr.index, expr.expr, ctx);
        case "comma":
            return [...emitExprToHl(expr.left, ctx), ...emitExprToHl(expr.right, ctx)];
        case "call":
            return emitCallExpr(expr.target, expr.args ?? [], ctx, expr.isVariadic);
        case "indirectCall":
            return emitIndirectCallExpr(expr.target, expr.args ?? [], ctx, expr.isVariadic);
        case "conditional":
            return emitConditionalExpr(expr.condition, expr.thenExpr, expr.elseExpr, ctx);
        case "logical":
            return emitLogicalExpr(expr.left, expr.right, expr.op, ctx);
        case "bitwise":
            return emitBitwiseExpr(expr.left, expr.right, expr.op, ctx);
        case "helperBinary":
            return emitHelperBinaryExpr(expr.left, expr.right, expr.helper, ctx);
        case "divmod":
            return emitDivmodExpr(expr.left, expr.right, expr.result, ctx);
        case "compare":
            return emitHelperCompare(expr.left, expr.right, expr.helper, ctx);
        case "additive":
            return emitAdditiveExpr(expr.left, expr.right, expr.op, ctx);
        case "aggregateConsumer":
            return emitAggregateConsumerExpr(expr.consumer, ctx);
        case "localChar":
        case "argChar":
            return emitLoadStackByteToHl(expr.offset, ctx);
        case "localInt":
        case "argInt":
            return emitLoadStackWordToHl(expr.offset, ctx);
        case "globalRef":
            return expr.width === 1
                ? [`\tld\ta,(${expr.name})`, "\tld\tl,a", "\tld\th,#0"]
                : [`\tld\thl,(${expr.name})`];
        default:
            return assertNever(expr);
    }
}
function emitCallExpr(target, args, ctx, isVariadic = false) {
    if (args.length === 0) {
        return [`\tcall\t${target}`];
    }
    return [...emitPushArgs(args, ctx, isVariadic), `\tcall\t${target}`, ...Array.from({ length: args.length }, () => "\tpop\tbc")];
}
function emitIndirectCallExpr(target, args, ctx, isVariadic = false) {
    // Keep arguments on the caller stack, then evaluate the jump target with
    // their stack delta. The previous target-first sequence popped an argument
    // into HL whenever an indirect call had one or more arguments.
    const lines = emitPushArgs(args, ctx, isVariadic);
    const returnLabel = allocateExprLabel(ctx);
    lines.push(...emitExprToHl(target, { ...ctx, stackDelta: ctx.stackDelta + args.length * 2 }));
    lines.push(`\tld\tde,#${returnLabel}`);
    lines.push("\tpush\tde");
    lines.push("\tjp\t(hl)");
    lines.push(`${returnLabel}:`);
    lines.push(...Array.from({ length: args.length }, () => "\tpop\tbc"));
    return lines;
}
function emitPushArgs(args, ctx, isVariadic = false) {
    const lines = [];
    let stackDelta = ctx.stackDelta;
    for (const arg of isVariadic ? [...args].reverse() : args) {
        if (arg.kind === "expr") {
            lines.push(...emitExprToHl(arg.expr, { ...ctx, stackDelta }));
        }
        else {
            lines.push(...emitAggregateProducerConsumer(arg.consumer.source, { kind: "addressArg", tempOffset: arg.consumer.tempOffset }, { ...ctx, stackDelta }));
        }
        lines.push("\tpush\thl");
        stackDelta += 2;
    }
    return lines;
}
function emitVaArgExpr(listOffset, width, ctx) {
    // BC receives the current va_list slot pointer.  Advance and persist it
    // before loading the old slot so nested expressions cannot observe a stale
    // list. Every variadic argument occupies a two-byte ABI slot.
    const lines = [
        ...emitLoadStackAddrToHl(listOffset, ctx),
        "\tld\tc,(hl)",
        "\tinc\thl",
        "\tld\tb,(hl)",
        "\tdec\thl",
        "\tinc\tbc",
        "\tinc\tbc",
        "\tld\ta,c",
        "\tld\t(hl),a",
        "\tinc\thl",
        "\tld\ta,b",
        "\tld\t(hl),a",
        "\tdec\tbc",
        "\tdec\tbc",
        "\tld\th,b",
        "\tld\tl,c",
    ];
    if (width === 1) {
        return [...lines, "\tld\ta,(hl)", "\tld\tl,a", "\tld\th,#0"];
    }
    return [...lines, "\tld\te,(hl)", "\tinc\thl", "\tld\td,(hl)", "\tex\tde,hl"];
}
function emitAggregateProducerAddressArg(source, tempOffset, ctx) {
    if (source.kind === "aggregateAddress") {
        return emitExprToHl(source.pointer, ctx);
    }
    return [
        ...emitAggregateProducerToTempLocal(source, tempOffset, inferAggregateTempSize(source), ctx),
        ...emitExprToHl({ kind: "localAddress", offset: tempOffset }, ctx),
    ];
}
function inferAggregateTempSize(source) {
    return source.size;
}
function emitAggregateConsumerExpr(consumer, ctx) {
    return emitAggregateProducerConsumer(consumer.source, consumer, ctx);
}
function emitAggregateProducerConsumer(source, consumer, ctx) {
    switch (consumer.kind) {
        case "addressArg":
            return emitAggregateProducerAddressArg(source, consumer.tempOffset, ctx);
        case "fieldRead":
            return emitAggregateProducerFieldRead(source, consumer.tempOffset, consumer.offset, consumer.width, ctx);
        case "fieldAddress":
            return emitAggregateProducerFieldAddress(source, consumer.tempOffset, consumer.offset, ctx);
        default:
            return assertNever(consumer);
    }
}
function emitReserveBytes(count) {
    return Array.from({ length: count }, () => "\tdec\tsp");
}
function emitReleaseBytes(count) {
    return Array.from({ length: count }, () => "\tinc\tsp");
}
function emitLoadStackAddrToHl(offset, ctx) {
    return [`\tld\thl,#${offset + ctx.stackDelta}`, "\tadd\thl,sp"];
}
function emitLoadStackByteToHl(offset, ctx) {
    return [...emitLoadStackAddrToHl(offset, ctx), "\tld\tl,(hl)", "\tld\th,#0"];
}
function emitLoadStackWordToHl(offset, ctx) {
    return [...emitLoadStackAddrToHl(offset, ctx), "\tld\ta,(hl)", "\tinc\thl", "\tld\th,(hl)", "\tld\tl,a"];
}
function emitStoreExprToLocalByte(offset, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tld\t(hl),e",
    ];
}
function emitStoreExprToLocalArrayByte(offset, index, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitExprToHl(index, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpush\thl",
        ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 4 }),
        "\tpop\tde",
        "\tadd\thl,de",
        "\tpop\tde",
        "\tld\t(hl),e",
    ];
}
function emitStoreExprToArgArrayByte(offset, index, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitExprToHl(index, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpush\thl",
        ...emitLoadStackWordToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 4 }),
        "\tpop\tde",
        "\tadd\thl,de",
        "\tpop\tde",
        "\tld\t(hl),e",
    ];
}
function emitLoadIndexedGlobalByteToHl(name, index, ctx) {
    return [
        ...emitExprToHl(index, ctx),
        "\tpush\thl",
        `\tld\thl,#${name}+0`,
        "\tpop\tde",
        "\tadd\thl,de",
        "\tld\tl,(hl)",
        "\tld\th,#0",
    ];
}
function emitAssignGlobalByteExpr(name, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tld\ta,l",
        `\tld\t(${name}),a`,
        "\tld\th,#0",
    ];
}
function emitAssignGlobalWordExpr(name, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        `\tld\t(${name}),hl`,
    ];
}
function emitAssignGlobalArrayExpr(name, index, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitExprToHl(index, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpush\thl",
        `\tld\thl,#${name}+0`,
        "\tpop\tde",
        "\tadd\thl,de",
        "\tpop\tde",
        "\tld\t(hl),e",
    ];
}
function emitStoreImm16ToLocal(offset, value, ctx) {
    return [
        ...emitLoadStackAddrToHl(offset, ctx),
        `\tld\t(hl),#${value & 0xff}`,
        "\tinc\thl",
        `\tld\t(hl),#${(value >> 8) & 0xff}`,
    ];
}
function emitStoreExprToLocalWord(offset, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tld\t(hl),e",
        "\tinc\thl",
        "\tld\t(hl),d",
    ];
}
function emitAssignLocalByteExpr(offset, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tld\t(hl),e",
        "\tld\tl,e",
        "\tld\th,#0",
    ];
}
function emitAssignLocalWordExpr(offset, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tld\t(hl),e",
        "\tinc\thl",
        "\tld\t(hl),d",
        "\tex\tde,hl",
    ];
}
function emitAssignLocalArrayExpr(offset, index, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitExprToHl(index, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpush\thl",
        ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 4 }),
        "\tpop\tde",
        "\tadd\thl,de",
        "\tpop\tde",
        "\tld\t(hl),e",
        "\tld\tl,e",
        "\tld\th,#0",
    ];
}
function emitAssignArgArrayExpr(offset, index, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitExprToHl(index, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpush\thl",
        ...emitLoadStackWordToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 4 }),
        "\tpop\tde",
        "\tadd\thl,de",
        "\tpop\tde",
        "\tld\t(hl),e",
        "\tld\tl,e",
        "\tld\th,#0",
    ];
}
function emitPointerAddExpr(pointer, index, scale, ctx) {
    return [
        ...emitExprToHl(pointer, ctx),
        "\tpush\thl",
        ...emitExprToHl(index, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        ...(scale === 2
            ? ["\tadd\thl,hl"]
            : scale > 2
                ? ["\tld\td,h", "\tld\te,l", ...Array.from({ length: scale - 1 }, () => "\tadd\thl,de")]
                : []),
        "\tpop\tde",
        "\tadd\thl,de",
    ];
}
function emitDerefByteExpr(pointer, ctx) {
    return [
        ...emitExprToHl(pointer, ctx),
        "\tld\tl,(hl)",
        "\tld\th,#0",
    ];
}
function emitDerefWordExpr(pointer, ctx) {
    return [
        ...emitExprToHl(pointer, ctx),
        "\tld\ta,(hl)",
        "\tinc\thl",
        "\tld\th,(hl)",
        "\tld\tl,a",
    ];
}
function emitAssignDerefByteExpr(pointer, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitExprToHl(pointer, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tld\t(hl),e",
        "\tld\tl,e",
        "\tld\th,#0",
    ];
}
function emitAssignDerefWordExpr(pointer, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitExprToHl(pointer, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tld\t(hl),e",
        "\tinc\thl",
        "\tld\t(hl),d",
        "\tex\tde,hl",
    ];
}
function emitIncDecDerefByteExpr(pointer, op, mode, ctx) {
    return [
        ...emitExprToHl(pointer, ctx),
        "\tld\te,(hl)",
        ...(mode === "postfix" ? ["\tld\td,#0", "\tpush\tde"] : []),
        op === "++" ? "\tinc\te" : "\tdec\te",
        "\tld\t(hl),e",
        ...(mode === "prefix" ? ["\tld\tl,e", "\tld\th,#0"] : ["\tpop\thl"]),
    ];
}
function emitIncDecDerefWordExpr(pointer, op, mode, ctx) {
    return [
        ...emitExprToHl(pointer, ctx),
        "\tld\te,(hl)",
        "\tinc\thl",
        "\tld\td,(hl)",
        ...(mode === "postfix" ? ["\tpush\tde"] : []),
        ...(op === "++" ? ["\tinc\tde"] : ["\tdec\tde"]),
        "\tdec\thl",
        "\tld\t(hl),e",
        "\tinc\thl",
        "\tld\t(hl),d",
        ...(mode === "prefix" ? ["\tex\tde,hl"] : ["\tpop\thl"]),
    ];
}
function emitIncDecLocalByteExpr(offset, op, mode, ctx) {
    return [
        ...emitLoadStackAddrToHl(offset, ctx),
        "\tld\te,(hl)",
        ...(mode === "postfix" ? ["\tld\tl,e", "\tld\th,#0"] : []),
        op === "++" ? "\tinc\te" : "\tdec\te",
        "\tld\t(hl),e",
        ...(mode === "prefix" ? ["\tld\tl,e", "\tld\th,#0"] : []),
    ];
}
function emitIncDecLocalWordExpr(offset, step, op, mode, ctx) {
    return [
        ...emitLoadStackAddrToHl(offset, ctx),
        "\tld\te,(hl)",
        "\tinc\thl",
        "\tld\td,(hl)",
        ...(mode === "postfix" ? ["\tpush\tde"] : []),
        ...(op === "++"
            ? step === 2 ? ["\tinc\tde", "\tinc\tde"] : ["\tinc\tde"]
            : step === 2 ? ["\tdec\tde", "\tdec\tde"] : ["\tdec\tde"]),
        "\tld\t(hl),d",
        "\tdec\thl",
        "\tld\t(hl),e",
        ...(mode === "prefix" ? ["\tex\tde,hl"] : ["\tpop\thl"]),
    ];
}
function emitIncDecLocalArrayExpr(offset, index, op, mode, ctx) {
    return [
        ...emitExprToHl(index, ctx),
        "\tpush\thl",
        ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tadd\thl,de",
        "\tld\te,(hl)",
        ...(mode === "postfix" ? ["\tld\tl,e", "\tld\th,#0"] : []),
        op === "++" ? "\tinc\te" : "\tdec\te",
        "\tld\t(hl),e",
        ...(mode === "prefix" ? ["\tld\tl,e", "\tld\th,#0"] : []),
    ];
}
function emitIncDecArgArrayExpr(offset, index, op, mode, ctx) {
    return [
        ...emitExprToHl(index, ctx),
        "\tpush\thl",
        ...emitLoadStackWordToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tadd\thl,de",
        "\tld\te,(hl)",
        ...(mode === "postfix" ? ["\tld\tl,e", "\tld\th,#0"] : []),
        op === "++" ? "\tinc\te" : "\tdec\te",
        "\tld\t(hl),e",
        ...(mode === "prefix" ? ["\tld\tl,e", "\tld\th,#0"] : []),
    ];
}
function emitLoadIndexedLocalByteToHl(offset, index, ctx) {
    return [
        ...emitExprToHl(index, ctx),
        "\tpush\thl",
        ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tadd\thl,de",
        "\tld\tl,(hl)",
        "\tld\th,#0",
    ];
}
function emitLoadIndexedArgByteToHl(offset, index, ctx) {
    return [
        ...emitExprToHl(index, ctx),
        "\tpush\thl",
        ...emitLoadStackWordToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tadd\thl,de",
        "\tld\tl,(hl)",
        "\tld\th,#0",
    ];
}
function emitHelperCompare(left, right, helper, ctx) {
    return [
        ...emitExprToHl(left, ctx),
        "\tpush\thl",
        ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        `\tcall\t${helper}`,
    ];
}
function emitAdditiveExpr(left, right, op, ctx) {
    const lines = [
        ...emitExprToHl(left, ctx),
        "\tpush\thl",
        ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
    ];
    if (op === "+") {
        return [...lines, "\tadd\thl,de"];
    }
    return [...lines, "\tex\tde,hl", "\tor\ta", "\tsbc\thl,de"];
}
function emitAggregateProducerFieldReadExpr(source, tempOffset, fieldOffset, width, ctx) {
    return emitAggregateProducerConsumer(source, { kind: "fieldRead", tempOffset, offset: fieldOffset, width }, ctx);
}
function emitAggregateProducerFieldRead(source, tempOffset, fieldOffset, width, ctx) {
    const pointerLines = tryEmitAggregateProducerFieldPointerToHl(source, tempOffset, fieldOffset, ctx);
    if (pointerLines) {
        return [
            ...pointerLines,
            ...(width === 1 ? emitDerefByteFromCurrentHl() : emitDerefWordFromCurrentHl()),
        ];
    }
    const requiredTempOffset = requireAggregateConsumerTempOffset(source, tempOffset);
    const loadExpr = width === 1
        ? { kind: "localChar", offset: requiredTempOffset + fieldOffset }
        : { kind: "localInt", offset: requiredTempOffset + fieldOffset };
    return [
        ...emitAggregateProducerToTempLocal(source, requiredTempOffset, getAggregateTempSizeForFieldAccess(fieldOffset, width), ctx),
        ...emitExprToHl(loadExpr, ctx),
    ];
}
function emitAggregateProducerFieldAddressExpr(source, tempOffset, fieldOffset, ctx) {
    return emitAggregateProducerConsumer(source, { kind: "fieldAddress", tempOffset, offset: fieldOffset }, ctx);
}
function emitAggregateProducerFieldAddress(source, tempOffset, fieldOffset, ctx) {
    const pointerLines = tryEmitAggregateProducerFieldPointerToHl(source, tempOffset, fieldOffset, ctx);
    if (pointerLines) {
        return pointerLines;
    }
    const requiredTempOffset = requireAggregateConsumerTempOffset(source, tempOffset);
    return [
        ...emitAggregateProducerToTempLocal(source, requiredTempOffset, getAggregateTempSizeForFieldAddress(fieldOffset), ctx),
        ...emitLoadStackAddrToHl(requiredTempOffset + fieldOffset, ctx),
    ];
}
function emitAggregateProducerToTempLocal(source, tempOffset, size, ctx) {
    return materializeAggregateProducerToDestination(source, { kind: "localSlot", offset: tempOffset, size }, ctx);
}
function requireAggregateConsumerTempOffset(source, tempOffset) {
    if (tempOffset === undefined) {
        throw new Error(`Aggregate consumer for '${source.kind}' requires a temporary local.`);
    }
    return tempOffset;
}
function tryEmitAggregateProducerFieldPointerToHl(source, tempOffset, fieldOffset, ctx) {
    switch (source.kind) {
        case "aggregateRef":
        case "aggregateAddress":
            return emitExprToHl(getAggregateFieldPointerFromRef(source, fieldOffset), ctx);
        case "aggregateAssignExpr":
            return [
                ...emitAggregateAssignExprValue(source, ctx),
                ...emitAggregateAssignExprEffectToTarget(source, ctx),
                ...emitLoadStackAddrToHl(source.valueDestination.offset + fieldOffset, ctx),
            ];
        case "call": {
            const requiredTempOffset = requireAggregateConsumerTempOffset(source, tempOffset);
            return [
                ...emitAggregateCallToDestination(source, { kind: "localSlot", offset: requiredTempOffset, size: source.size }, ctx),
                ...emitLoadStackAddrToHl(requiredTempOffset + fieldOffset, ctx),
            ];
        }
        case "comma": {
            const right = tryEmitAggregateProducerFieldPointerToHl(source.right, tempOffset, fieldOffset, ctx);
            return right ? [...emitExprToHl(source.left, ctx), ...right] : null;
        }
        case "conditional": {
            const thenLines = tryEmitAggregateProducerFieldPointerToHl(source.thenExpr, tempOffset, fieldOffset, ctx);
            const elseLines = tryEmitAggregateProducerFieldPointerToHl(source.elseExpr, tempOffset, fieldOffset, ctx);
            if (!thenLines || !elseLines) {
                return null;
            }
            const elseLabel = allocateExprLabel(ctx);
            const endLabel = allocateExprLabel(ctx);
            return [
                ...emitExprToHl(source.condition, ctx),
                "\tld\ta,h",
                "\tor\tl",
                `\tjp\tz,${elseLabel}`,
                ...thenLines,
                `\tjp\t${endLabel}`,
                `${elseLabel}:`,
                ...elseLines,
                `${endLabel}:`,
            ];
        }
        default:
            return null;
    }
}
function getAggregateFieldPointerFromRef(source, fieldOffset) {
    return getAggregateFieldPointerFromBasePointer(getAggregateRefPointerExpr(source), fieldOffset);
}
function getAggregateFieldPointerFromAssignDestination(destination, fieldOffset) {
    return getAggregateFieldPointerFromBasePointer(destination.kind === "localSlot"
        ? { kind: "localAddress", offset: destination.offset }
        : { kind: "globalAddress", name: destination.name }, fieldOffset);
}
function getAggregateRefPointerExpr(source) {
    if (source.kind === "aggregateAddress") {
        return source.pointer;
    }
    return source.scope === "global"
        ? { kind: "globalAddress", name: source.name }
        : source.scope === "local"
            ? { kind: "localAddress", offset: source.offset }
            : { kind: "argInt", offset: source.offset };
}
function getAggregateFieldPointerFromBasePointer(basePointer, fieldOffset) {
    return {
        kind: "pointerAdd",
        pointer: basePointer,
        index: { kind: "const", value: fieldOffset },
        scale: 1,
    };
}
function emitDerefByteFromCurrentHl() {
    return [
        "\tld\tl,(hl)",
        "\tld\th,#0",
    ];
}
function emitDerefWordFromCurrentHl() {
    return [
        "\tld\ta,(hl)",
        "\tinc\thl",
        "\tld\th,(hl)",
        "\tld\tl,a",
    ];
}
function getAggregateTempSizeForFieldAccess(fieldOffset, width) {
    return fieldOffset + width;
}
function getAggregateTempSizeForFieldAddress(fieldOffset) {
    return fieldOffset + 1;
}
function materializeAggregateProducerToDestination(source, destination, ctx) {
    return emitAggregateProducerToDestination(source, lowerAggregateEmitDestination(destination), ctx);
}
function lowerAggregateEmitDestination(destination) {
    switch (destination.kind) {
        case "localSlot":
            return destination;
        case "globalSymbol":
            return { kind: "pointer", pointer: { kind: "globalAddress", name: destination.name }, size: destination.size };
        case "pointer":
            return destination;
        case "returnSlot":
            return { kind: "pointer", pointer: { kind: "argInt", offset: 0 }, size: destination.size };
        default:
            return assertNever(destination);
    }
}
function emitAggregateProducerToDestination(source, destination, ctx) {
    switch (source.kind) {
        case "aggregateRef":
            return emitAggregateRefToDestination(source, destination, ctx);
        case "aggregateAddress":
            return emitAggregateCopyFromSourcePointerToDestination(source.pointer, destination, source.size, ctx);
        case "aggregateAssignExpr":
            return emitAggregateAssignExprToDestination(source, destination, ctx);
        case "call":
        case "indirectCall":
            return emitAggregateCallToDestination(source, destination, ctx);
        case "comma":
            return [
                ...emitExprToHl(source.left, ctx),
                ...emitAggregateProducerToDestination(source.right, destination, ctx),
            ];
        case "conditional": {
            const elseLabel = allocateExprLabel(ctx);
            const endLabel = allocateExprLabel(ctx);
            return [
                ...emitExprToHl(source.condition, ctx),
                "\tld\ta,h",
                "\tor\tl",
                `\tjp\tz,${elseLabel}`,
                ...emitAggregateProducerToDestination(source.thenExpr, destination, ctx),
                `\tjp\t${endLabel}`,
                `${elseLabel}:`,
                ...emitAggregateProducerToDestination(source.elseExpr, destination, ctx),
                `${endLabel}:`,
            ];
        }
        default:
            return assertNever(source);
    }
}
function emitAggregateRefToDestination(source, destination, ctx) {
    if (source.scope === "local") {
        return emitAggregateCopyFromSourcePointerToDestination({ kind: "localAddress", offset: source.offset }, destination, source.size, ctx);
    }
    if (source.scope === "arg") {
        return emitAggregateCopyFromSourcePointerToDestination({ kind: "argInt", offset: source.offset }, destination, source.size, ctx);
    }
    const globalSource = source;
    return emitAggregateCopyFromSourcePointerToDestination({ kind: "globalAddress", name: globalSource.name }, destination, globalSource.size, ctx);
}
function emitAggregateAssignExprToDestination(source, destination, ctx) {
    return [
        ...emitAggregateAssignExprValue(source, ctx),
        ...emitAggregateAssignExprEffectToTarget(source, ctx),
        ...emitAggregateCopyLocalSlotToDestination(source.valueDestination.offset, source.size, destination, ctx),
    ];
}
function emitAggregateAssignExprValue(source, ctx) {
    return emitAggregateProducerToDestination(source.source, {
        kind: "localSlot",
        offset: source.valueDestination.offset,
        size: source.size,
    }, ctx);
}
function emitAggregateAssignExprEffectToTarget(source, ctx) {
    const effectDestination = getAggregateAssignEffectDestination(source);
    if (effectDestination.kind === "localSlot" && effectDestination.offset === source.valueDestination.offset) {
        return [];
    }
    return emitAggregateCopyLocalSlotToDestination(source.valueDestination.offset, source.size, effectDestination, ctx);
}
function getAggregateAssignEffectDestination(source) {
    if (source.effectDestination.kind === "localSlot") {
        return source.effectDestination;
    }
    if (source.effectDestination.kind === "pointer") {
        return source.effectDestination;
    }
    return { kind: "pointer", pointer: { kind: "globalAddress", name: source.effectDestination.name }, size: source.size };
}
function emitAggregateCallToDestination(source, destination, ctx) {
    const args = [{ kind: "expr", expr: getAggregateDestinationPointerExpr(destination) }, ...(source.args ?? [])];
    if (source.kind === "indirectCall") {
        return emitIndirectCallExpr(source.target, args, ctx, source.isVariadic);
    }
    return [...emitPushArgs(args, ctx, source.isVariadic), `\tcall\t${source.target}`, ...Array.from({ length: args.length }, () => "\tpop\tbc")];
}
function getAggregateDestinationPointerExpr(destination) {
    switch (destination.kind) {
        case "localSlot":
            return { kind: "localAddress", offset: destination.offset };
        case "pointer":
            return destination.pointer;
        default:
            return assertNever(destination);
    }
}
function emitAggregateCopyFromSourcePointerToDestination(sourcePointer, destination, size, ctx) {
    switch (destination.kind) {
        case "localSlot":
            return emitAggregateCopyFromPointerToPointer(sourcePointer, { kind: "localAddress", offset: destination.offset }, size, ctx);
        case "pointer":
            return emitAggregateCopyFromPointerToPointer(sourcePointer, destination.pointer, size, ctx);
        default:
            return assertNever(destination);
    }
}
function emitAggregateCopyLocalSlotToDestination(sourceOffset, size, destination, ctx) {
    switch (destination.kind) {
        case "localSlot":
            return sourceOffset === destination.offset ? [] : emitAggregateCopyFromLocal(sourceOffset, destination.offset, size, ctx);
        case "pointer":
            return emitAggregateCopyFromPointerToPointer({ kind: "localAddress", offset: sourceOffset }, destination.pointer, size, ctx);
        default:
            return assertNever(destination);
    }
}
function emitAggregateCopyFromLocal(sourceOffset, targetOffset, size, ctx) {
    const lines = [];
    for (let index = 0; index < size; index += 1) {
        lines.push(...emitAssignDerefByteExpr({
            kind: "pointerAdd",
            pointer: { kind: "localAddress", offset: targetOffset },
            index: { kind: "const", value: index },
            scale: 1,
        }, {
            kind: "derefByte",
            pointer: {
                kind: "pointerAdd",
                pointer: { kind: "localAddress", offset: sourceOffset },
                index: { kind: "const", value: index },
                scale: 1,
            },
        }, ctx));
    }
    return lines;
}
function emitAggregateCopyFromGlobal(name, targetOffset, size, ctx) {
    const lines = [];
    for (let index = 0; index < size; index += 1) {
        lines.push(...emitAssignDerefByteExpr({
            kind: "pointerAdd",
            pointer: { kind: "localAddress", offset: targetOffset },
            index: { kind: "const", value: index },
            scale: 1,
        }, {
            kind: "derefByte",
            pointer: {
                kind: "pointerAdd",
                pointer: { kind: "globalAddress", name },
                index: { kind: "const", value: index },
                scale: 1,
            },
        }, ctx));
    }
    return lines;
}
function emitAggregateCopyFromPointerToPointer(sourcePointer, targetPointer, size, ctx) {
    const lines = [];
    for (let index = 0; index < size; index += 1) {
        lines.push(...emitAssignDerefByteExpr({
            kind: "pointerAdd",
            pointer: targetPointer,
            index: { kind: "const", value: index },
            scale: 1,
        }, {
            kind: "derefByte",
            pointer: {
                kind: "pointerAdd",
                pointer: sourcePointer,
                index: { kind: "const", value: index },
                scale: 1,
            },
        }, ctx));
    }
    return lines;
}
function emitAggregateCopyLocalToGlobal(sourceOffset, targetName, size, ctx) {
    const lines = [];
    for (let index = 0; index < size; index += 1) {
        lines.push(...emitAssignDerefByteExpr({
            kind: "pointerAdd",
            pointer: { kind: "globalAddress", name: targetName },
            index: { kind: "const", value: index },
            scale: 1,
        }, {
            kind: "derefByte",
            pointer: {
                kind: "pointerAdd",
                pointer: { kind: "localAddress", offset: sourceOffset },
                index: { kind: "const", value: index },
                scale: 1,
            },
        }, ctx));
    }
    return lines;
}
function emitAggregateCopyFromArgAddress(sourceOffset, targetOffset, size, ctx) {
    const lines = [];
    for (let index = 0; index < size; index += 1) {
        lines.push(...emitAssignDerefByteExpr({
            kind: "pointerAdd",
            pointer: { kind: "localAddress", offset: targetOffset },
            index: { kind: "const", value: index },
            scale: 1,
        }, {
            kind: "derefByte",
            pointer: {
                kind: "pointerAdd",
                pointer: { kind: "argInt", offset: sourceOffset },
                index: { kind: "const", value: index },
                scale: 1,
            },
        }, ctx));
    }
    return lines;
}
function emitLogicalExpr(left, right, op, ctx) {
    const trueLabel = allocateExprLabel(ctx);
    const falseLabel = allocateExprLabel(ctx);
    const endLabel = allocateExprLabel(ctx);
    if (op === "&&") {
        return [
            ...emitExprToHl(left, ctx),
            "\tld\ta,h",
            "\tor\tl",
            `\tjp\tz,${falseLabel}`,
            ...emitExprToHl(right, ctx),
            "\tld\ta,h",
            "\tor\tl",
            `\tjp\tz,${falseLabel}`,
            `${trueLabel}:`,
            "\tld\thl,#1",
            `\tjp\t${endLabel}`,
            `${falseLabel}:`,
            "\tld\thl,#0",
            `${endLabel}:`,
        ];
    }
    return [
        ...emitExprToHl(left, ctx),
        "\tld\ta,h",
        "\tor\tl",
        `\tjp\tnz,${trueLabel}`,
        ...emitExprToHl(right, ctx),
        "\tld\ta,h",
        "\tor\tl",
        `\tjp\tnz,${trueLabel}`,
        `${falseLabel}:`,
        "\tld\thl,#0",
        `\tjp\t${endLabel}`,
        `${trueLabel}:`,
        "\tld\thl,#1",
        `${endLabel}:`,
    ];
}
function emitConditionalExpr(condition, thenExpr, elseExpr, ctx) {
    const elseLabel = allocateExprLabel(ctx);
    const endLabel = allocateExprLabel(ctx);
    return [
        ...emitExprToHl(condition, ctx),
        "\tld\ta,h",
        "\tor\tl",
        `\tjp\tz,${elseLabel}`,
        ...emitExprToHl(thenExpr, ctx),
        `\tjp\t${endLabel}`,
        `${elseLabel}:`,
        ...emitExprToHl(elseExpr, ctx),
        `${endLabel}:`,
    ];
}
function emitBitwiseExpr(left, right, op, ctx) {
    const lines = [
        ...emitExprToHl(left, ctx),
        "\tpush\thl",
        ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
    ];
    switch (op) {
        case "&":
            return [...lines, "\tld\ta,h", "\tand\td", "\tld\th,a", "\tld\ta,l", "\tand\te", "\tld\tl,a"];
        case "^":
            return [...lines, "\tld\ta,h", "\txor\td", "\tld\th,a", "\tld\ta,l", "\txor\te", "\tld\tl,a"];
        case "|":
            return [...lines, "\tld\ta,h", "\tor\td", "\tld\th,a", "\tld\ta,l", "\tor\te", "\tld\tl,a"];
        default:
            return assertNever(op);
    }
}
function emitHelperBinaryExpr(left, right, helper, ctx) {
    return [
        ...emitExprToHl(left, ctx),
        "\tpush\thl",
        ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        `\tcall\t${helper}`,
    ];
}
function emitDivmodExpr(left, right, result, ctx) {
    const lines = [
        ...emitExprToHl(left, ctx),
        "\tpush\thl",
        ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tcall\t.div",
    ];
    if (result === "quotient") {
        return lines;
    }
    return [...lines, "\tex\tde,hl"];
}
function allocateExprLabel(ctx) {
    const label = `.${ctx.labels.labelPrefix}_${ctx.labels.nextLogicalLabelId}`;
    ctx.labels.nextLogicalLabelId += 1;
    return label;
}
function assertNever(value) {
    throw new Error(`Unhandled statement kind: ${JSON.stringify(value)}`);
}

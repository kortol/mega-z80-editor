"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePeg = parsePeg;
const context_1 = require("../../assembler-old/context");
const tokenizer_1 = require("../../assembler-old/tokenizer");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pegParser = require("./gen/z80_assembler.js");
function locToPos(ctx, loc, end = false) {
    const p = end ? loc?.end : loc?.start;
    const line = Math.max(0, (p?.line ?? 1) - 1);
    const column = Math.max(0, (p?.column ?? 1) - 1);
    return {
        file: ctx.currentPos.file,
        line,
        column,
        phase: ctx.phase,
    };
}
function exprToRaw(expr) {
    if (!expr)
        return "";
    if (typeof expr === "string")
        return expr;
    if (typeof expr === "number")
        return String(expr);
    if (expr.raw)
        return String(expr.raw);
    if (expr.type === "number")
        return String(expr.value);
    if (expr.type === "identifier")
        return String(expr.name);
    if (expr.type === "currentAddress")
        return "$";
    if (expr.type === "register")
        return String(expr.name);
    if (expr.type === "binaryOp") {
        return `${exprToRaw(expr.left)}${expr.op}${exprToRaw(expr.right)}`;
    }
    if (expr.type === "unaryOp") {
        return `${expr.op}${exprToRaw(expr.expr)}`;
    }
    if (expr.type === "string")
        return expr.raw ?? `"${expr.value ?? ""}"`;
    if (expr.type === "indirect")
        return `(${exprToRaw(expr.operand)})`;
    if (expr.type === "indexedIndirect")
        return expr.raw ?? `(${expr.base}${expr.offset ? `${expr.offset.sign}${exprToRaw(expr.offset.value)}` : ""})`;
    return String(expr.value ?? "");
}
function operandToRaw(op) {
    if (!op)
        return "";
    if (op.raw)
        return String(op.raw);
    return exprToRaw(op);
}
function toPseudoArgsFromValues(values) {
    return values.map((v) => ({ value: String(exprToRaw(v)) }));
}
function makePseudo(op, args, pos) {
    return { kind: "pseudo", op, args, pos };
}
function makeInstr(op, args, pos) {
    return { kind: "instr", op, args, pos };
}
function makeLabel(name, pos) {
    return { kind: "label", name, pos };
}
function tokenizeMacroBody(ctx, body, pos) {
    const saved = { ...ctx.currentPos };
    ctx.currentPos.file = pos.file;
    ctx.currentPos.line = pos.line;
    ctx.currentPos.column = pos.column ?? 0;
    const tokens = (0, tokenizer_1.tokenize)(ctx, body);
    ctx.currentPos = saved;
    return tokens;
}
function parsePeg(ctx, source) {
    const ast = pegParser.parse(source);
    const nodes = [];
    const macroNames = new Set();
    const useMacroOverride = !ctx.options?.strictMacro;
    function registerMacro(name) {
        macroNames.add((0, context_1.canon)(name, ctx));
    }
    function hasMacro(name) {
        return macroNames.has((0, context_1.canon)(name, ctx));
    }
    for (const item of ast ?? []) {
        if (!item)
            continue;
        if (item.type === "macroDef") {
            const pos = locToPos(ctx, item.pos);
            const endPos = locToPos(ctx, item.pos, true);
            const bodyTokens = tokenizeMacroBody(ctx, item.body ?? "", pos);
            const def = {
                kind: "macroDef",
                name: item.name,
                params: item.params ?? [],
                bodyTokens,
                startPos: pos,
                endPos,
                pos,
                isLocal: false,
            };
            nodes.push(def);
            registerMacro(item.name);
            continue;
        }
        if (item.type === "macroLoop") {
            const pos = locToPos(ctx, item.pos);
            const bodyTokens = tokenizeMacroBody(ctx, item.body ?? "", pos);
            const countExpr = item.count
                ? { kind: "Expr", text: exprToRaw(item.count), value: item.count?.value, pos }
                : undefined;
            if (item.op === "IRP") {
                const rawArgs = item.args ?? [];
                const argTokens = [];
                for (let i = 0; i < rawArgs.length; i++) {
                    if (i > 0)
                        argTokens.push(",");
                    argTokens.push(rawArgs[i]);
                }
                nodes.push({
                    kind: "macroLoop",
                    op: "IRP",
                    args: [item.symbol, ...argTokens],
                    pos,
                    bodyTokens,
                });
                continue;
            }
            if (item.op === "IRPC") {
                nodes.push({
                    kind: "macroLoop",
                    op: "IRPC",
                    pos,
                    bodyTokens,
                    strLiteral: item.str?.value ?? item.strLiteral ?? "",
                    symbolName: item.symbol,
                });
                continue;
            }
            if (item.op === "WHILE") {
                const condExpr = item.cond
                    ? { kind: "Expr", text: exprToRaw(item.cond), pos }
                    : undefined;
                nodes.push({
                    kind: "macroLoop",
                    op: "WHILE",
                    pos,
                    condExpr,
                    bodyTokens,
                });
                continue;
            }
            nodes.push({
                kind: "macroLoop",
                op: "REPT",
                pos,
                countExpr,
                bodyTokens,
            });
            continue;
        }
        if (item.type === "line") {
            const linePos = locToPos(ctx, item.pos);
            if (item.label?.name) {
                nodes.push(makeLabel(item.label.name, linePos));
            }
            const instr = item.instruction;
            if (!instr)
                continue;
            if (instr.type === "directive") {
                const op = String(instr.name).toUpperCase();
                const pos = locToPos(ctx, instr.pos ?? item.pos);
                switch (op) {
                    case "ORG":
                        nodes.push(makePseudo("ORG", [{ value: exprToRaw(instr.value) }], pos));
                        break;
                    case "DB":
                    case "DEFB":
                        nodes.push(makePseudo(op, toPseudoArgsFromValues(instr.values ?? []), pos));
                        break;
                    case "DZ":
                        nodes.push(makePseudo("DZ", toPseudoArgsFromValues(instr.values ?? []), pos));
                        break;
                    case "DW":
                    case "DEFW":
                        nodes.push(makePseudo(op, toPseudoArgsFromValues(instr.values ?? []), pos));
                        break;
                    case "DS":
                    case "DEFS":
                        nodes.push(makePseudo(op, [{ value: exprToRaw(instr.size) }], pos));
                        break;
                    case "EQU":
                        nodes.push(makePseudo("EQU", [{ key: String(instr.symbol), value: exprToRaw(instr.value) }], pos));
                        break;
                    case "SET":
                        nodes.push(makePseudo("SET", [{ key: String(instr.symbol), value: exprToRaw(instr.value) }], pos));
                        break;
                    case "END":
                        if (instr.value) {
                            nodes.push(makePseudo("END", [{ value: exprToRaw(instr.value) }], pos));
                        }
                        else {
                            nodes.push(makePseudo("END", [], pos));
                        }
                        break;
                    case "IF":
                        nodes.push(makePseudo("IF", [{ value: exprToRaw(instr.value) }], pos));
                        break;
                    case "ELSEIF":
                        nodes.push(makePseudo("ELSEIF", [{ value: exprToRaw(instr.value) }], pos));
                        break;
                    case "ELSE":
                        nodes.push(makePseudo("ELSE", [], pos));
                        break;
                    case "ENDIF":
                        nodes.push(makePseudo("ENDIF", [], pos));
                        break;
                    case "IFIDN":
                        nodes.push(makePseudo("IFIDN", [
                            { value: exprToRaw(instr.left) },
                            { value: exprToRaw(instr.right) },
                        ], pos));
                        break;
                    case "EXTERN": {
                        const args = (instr.symbols ?? []).map((s) => ({ value: s }));
                        nodes.push(makePseudo("EXTERN", args, pos));
                        break;
                    }
                    case "SECTION": {
                        const args = [{ value: instr.section }];
                        if (instr.align) {
                            args.push({ key: "ALIGN", value: exprToRaw(instr.align) });
                        }
                        nodes.push(makePseudo("SECTION", args, pos));
                        break;
                    }
                    case "INCLUDE": {
                        const val = instr.path?.value ?? instr.path?.name ?? exprToRaw(instr.path);
                        nodes.push(makePseudo("INCLUDE", [{ value: val }], pos));
                        break;
                    }
                    case "ALIGN":
                        nodes.push(makePseudo("ALIGN", [{ value: exprToRaw(instr.value) }], pos));
                        break;
                    case ".SYMLEN":
                        nodes.push(makePseudo(".SYMLEN", instr.value ? [{ value: exprToRaw(instr.value) }] : [], pos));
                        break;
                    case ".WORD32":
                        nodes.push(makePseudo(".WORD32", [], pos));
                        break;
                    default:
                        nodes.push(makePseudo(op, [], pos));
                        break;
                }
                continue;
            }
            if (instr.type === "macroInvoke") {
                const pos = locToPos(ctx, instr.pos ?? item.pos);
                nodes.push({ kind: "macroInvoke", name: instr.name, args: instr.args ?? [], pos });
                continue;
            }
            if (instr.type === "instruction") {
                const pos = locToPos(ctx, instr.pos ?? item.pos);
                const args = [];
                if (instr.condition) {
                    args.push(String(instr.condition));
                }
                for (const op of instr.operands ?? []) {
                    args.push(operandToRaw(op));
                }
                const opName = String(instr.mnemonic).toUpperCase();
                if (useMacroOverride && hasMacro(opName)) {
                    nodes.push({ kind: "macroInvoke", name: opName, args, pos });
                }
                else {
                    nodes.push(makeInstr(opName, args, pos));
                }
                continue;
            }
        }
    }
    return nodes;
}

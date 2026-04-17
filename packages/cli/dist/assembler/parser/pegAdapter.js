"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePeg = parsePeg;
const context_1 = require("../../assembler/context");
const tokenizer_1 = require("../../assembler/tokenizer");
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
    // Normalize register names to uppercase so encoder matches (e.g., "hl" -> "HL").
    if (op?.type === "register" && typeof op.name === "string") {
        return op.name.toUpperCase();
    }
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
function makeEmpty(pos) {
    return { kind: "empty", pos };
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
    let ast;
    try {
        ast = pegParser.parse(source);
    }
    catch (err) {
        if (err?.name === "SyntaxError" || /Expected/.test(String(err?.message ?? ""))) {
            throw new Error("Syntax error");
        }
        throw err;
    }
    const nodes = [];
    const pseudoOps = new Set([
        "ORG", "DB", "DW", "EQU", "END", "INCLUDE", "MACRO", "ENDM", "REPT", "ENDR",
        "DEFB", "DEFW", "DEFS", "ALIGN", "PUBLIC", "EXTERN", "LOCAL", "SECTION", "SEGMENT", "GLOBAL",
        "IF", "ELSE", "ELSEIF", "ENDIF", "IFIDN", "DZ", "DS", ".SYMLEN", ".WORD32",
        "DEFL", "DEFM", "DC", "IFDEF", "IFNDEF", "IFB", "IFNB", "IFDIF", "EXITM", "INCPATH",
        "ASEG", "CSEG", "DSEG", "TITLE", "PAGE", "LIST", "COMMON", "EXTERNAL", "EXT"
    ]);
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
            const params = (item.params ?? []).map((p) => {
                if (typeof p === "string")
                    return { name: p };
                const name = String(p?.name ?? p?.identifier ?? "");
                const defExpr = p?.default ?? p?.def ?? p?.value;
                const def = defExpr != null ? exprToRaw(defExpr) : undefined;
                return def ? { name, default: def } : { name };
            });
            const def = {
                kind: "macroDef",
                name: item.name,
                params,
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
        if (item.type === "empty") {
            const pos = locToPos(ctx, item.pos);
            nodes.push(makeEmpty(pos));
            continue;
        }
        if (item.type === "line") {
            const linePos = locToPos(ctx, item.pos);
            let labelName = item.label?.name;
            let labelColon = Boolean(item.label?.colon);
            const instr = item.instruction;
            if (!instr) {
                // ラベル単独行だが、同名マクロがある場合はマクロ呼び出しを優先
                if (labelName && hasMacro(labelName)) {
                    nodes.push({ kind: "macroInvoke", name: labelName, args: [], pos: linePos });
                    continue;
                }
                if (labelName)
                    nodes.push(makeLabel(labelName, linePos));
                if (!labelName)
                    nodes.push(makeEmpty(linePos));
                continue;
            }
            // LABEL 単独行（コロン無し）の限定救済:
            // すべてmacroInvoke扱いにすると z80test の `data` など通常ラベルが落ちる。
            // 一方で `FOO` のような大文字トークンは未定義マクロ検出を優先したいので、
            // 小文字を含む識別子のみラベルとして救済する。
            if (!labelName && instr.type === "macroInvoke") {
                const rawArgs = instr.args ?? [];
                const name = String(instr.name);
                const nameUpper = name.toUpperCase();
                const isPseudoSelf = pseudoOps.has(nameUpper);
                const isOpcodeSelf = ctx.opcodes?.has((0, context_1.canon)(nameUpper, ctx));
                const isMacroSelf = hasMacro(name);
                const looksLikeLabel = /[a-z]/.test(name);
                if (rawArgs.length === 0 && !isPseudoSelf && !isOpcodeSelf && !isMacroSelf && looksLikeLabel) {
                    nodes.push(makeLabel(name, linePos));
                    continue;
                }
            }
            // LABEL MACRO arg... / LABEL OPCODE ... / LABEL PSEUDO ...
            // parser上は「macroInvoke(name=LABEL, args=[OPCODE, ...])」になるため救済する
            if (!labelName && instr.type === "macroInvoke") {
                const rawArgs = instr.args ?? [];
                const selfUpper = String(instr.name).toUpperCase();
                const isPseudoSelf = pseudoOps.has(selfUpper);
                if (isPseudoSelf) {
                    if (selfUpper === "DEFL" && rawArgs.length >= 2) {
                        nodes.push(makePseudo("SET", [{ key: String(rawArgs[0]), value: String(rawArgs[1]) }], linePos));
                    }
                    else {
                        nodes.push(makePseudo(selfUpper, rawArgs.map((v) => ({ value: String(v) })), linePos));
                    }
                    continue;
                }
                const firstArg = rawArgs[0];
                if (firstArg != null && String(firstArg).trim() !== "") {
                    const opCandidate = String(firstArg);
                    const opUpper = opCandidate.toUpperCase();
                    const isPseudoLead = pseudoOps.has(opUpper);
                    const isOpcodeLead = ctx.opcodes?.has((0, context_1.canon)(opUpper, ctx));
                    const isMacroLead = hasMacro(opCandidate);
                    if (isPseudoLead || isOpcodeLead || isMacroLead) {
                        labelName = String(instr.name);
                        labelColon = false;
                        nodes.push(makeLabel(labelName, linePos));
                        const restArgs = rawArgs.slice(1).map((a) => (a == null ? "" : String(a)));
                        if (isPseudoLead) {
                            if (opUpper === "EQU" || opUpper === "SET" || opUpper === "DEFL") {
                                const value = restArgs[0] ?? "";
                                nodes.push(makePseudo(opUpper === "DEFL" ? "SET" : opUpper, [{ key: labelName, value: String(value) }], linePos));
                            }
                            else if (opUpper === "IFDIF" && restArgs.length >= 2) {
                                nodes.push(makePseudo("IFDIF", [{ value: restArgs[0] }, { value: restArgs[1] }], linePos));
                            }
                            else {
                                nodes.push(makePseudo(opUpper, restArgs.map((v) => ({ value: v })), linePos));
                            }
                        }
                        else if (isOpcodeLead) {
                            nodes.push(makeInstr(opUpper, restArgs, linePos));
                        }
                        else {
                            nodes.push({ kind: "macroInvoke", name: opCandidate, args: restArgs, pos: linePos });
                        }
                        continue;
                    }
                }
            }
            // IFDEF FOO / EXTERNAL BAR / TITLE NAME などが
            // parser上「label + macroInvoke」に分割されるケースを疑似命令へ救済する
            if (labelName && !labelColon && instr.type === "macroInvoke") {
                const leadingOp = String(labelName).toUpperCase();
                const leadingPseudo = new Set([
                    "IFDEF", "IFNDEF", "IFB", "IFNB", "IFDIF",
                    "GLOBAL", "PUBLIC", "LOCAL",
                    "EXTERNAL", "EXT",
                    "TITLE", "LIST",
                ]);
                if (leadingPseudo.has(leadingOp)) {
                    const pos = linePos;
                    const flatArgs = [String(instr.name), ...(instr.args ?? []).map((a) => (a == null ? "" : String(a)))];
                    if (leadingOp === "IFDIF" && flatArgs.length >= 2) {
                        nodes.push(makePseudo("IFDIF", [{ value: flatArgs[0] }, { value: flatArgs[1] }], pos));
                    }
                    else {
                        nodes.push(makePseudo(leadingOp, flatArgs.map((v) => ({ value: v })), pos));
                    }
                    continue;
                }
            }
            // IFDEF/EXTERNAL/PUBLIC などが
            // parser上「label + instruction」に分割されるケースを疑似命令へ救済する
            if (labelName && !labelColon && instr.type === "instruction") {
                const leadingOp = String(labelName).toUpperCase();
                const leadingPseudo = new Set([
                    "IFDEF", "IFNDEF", "IFB", "IFNB", "IFDIF",
                    "GLOBAL", "PUBLIC", "LOCAL",
                    "EXTERNAL", "EXT",
                    "TITLE", "LIST", "PAGE",
                ]);
                if (leadingPseudo.has(leadingOp)) {
                    const pos = linePos;
                    const flatArgs = [
                        String(instr.mnemonic),
                        ...(instr.operands ?? []).map((a) => operandToRaw(a)),
                    ];
                    if (leadingOp === "IFDIF" && flatArgs.length >= 2) {
                        nodes.push(makePseudo("IFDIF", [{ value: flatArgs[0] }, { value: flatArgs[1] }], pos));
                    }
                    else {
                        nodes.push(makePseudo(leadingOp, flatArgs.map((v) => ({ value: v })), pos));
                    }
                    continue;
                }
            }
            // FOO EQU 10 / FOO SET 20 などのラベル横並びシンタックスを対応
            if (labelName && instr.type === "macroInvoke") {
                const op = String(instr.name).toUpperCase();
                const args = (instr.args ?? []).map((a) => (a == null ? "" : String(a)));
                if (op === "EQU" || op === "SET" || op === "DEFL") {
                    const value = args[0] ?? "";
                    nodes.push(makePseudo(op === "DEFL" ? "SET" : op, [{ key: labelName, value: String(value) }], linePos));
                    continue;
                }
            }
            let skipLabel = false;
            if (labelName && instr.type === "directive") {
                const op = String(instr.name ?? "").toUpperCase();
                if (op === "EQU" && !instr.symbol) {
                    skipLabel = true;
                }
            }
            if (labelName && !skipLabel) {
                nodes.push(makeLabel(labelName, linePos));
            }
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
                    case "DEFL":
                        nodes.push(makePseudo("SET", [{ key: String(instr.symbol), value: exprToRaw(instr.value) }], pos));
                        break;
                    case "DEFM":
                        nodes.push(makePseudo("DB", toPseudoArgsFromValues(instr.values ?? []), pos));
                        break;
                    case "DC":
                        nodes.push(makePseudo("DC", toPseudoArgsFromValues(instr.values ?? []), pos));
                        break;
                    case "EQU": {
                        const symbol = instr.symbol ?? labelName;
                        if (!symbol) {
                            throw new Error(`EQU missing symbol at line ${pos.line}`);
                        }
                        nodes.push(makePseudo("EQU", [{ key: String(symbol), value: exprToRaw(instr.value) }], pos));
                        break;
                    }
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
                        if (instr.from) {
                            args.push({ value: "FROM" });
                            args.push({ value: String(instr.from) });
                        }
                        nodes.push(makePseudo("EXTERN", args, pos));
                        break;
                    }
                    case "EXT":
                    case "EXTERNAL": {
                        const args = (instr.symbols ?? []).map((s) => ({ value: s }));
                        nodes.push(makePseudo(op, args, pos));
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
                    case "INCPATH": {
                        const paths = (instr.paths ?? []).map((p) => {
                            const val = p?.value ?? p?.name ?? exprToRaw(p);
                            return { value: String(val) };
                        });
                        nodes.push(makePseudo("INCPATH", paths, pos));
                        break;
                    }
                    case "ALIGN":
                        nodes.push(makePseudo("ALIGN", [{ value: exprToRaw(instr.value) }], pos));
                        break;
                    case ".SYMLEN":
                        nodes.push(makePseudo(".SYMLEN", instr.value ? [{ value: exprToRaw(instr.value) }] : [], pos));
                        break;
                    case ".ORG":
                        nodes.push(makePseudo("ORG", toPseudoArgsFromValues(instr.values ?? (instr.args ?? [])), pos));
                        break;
                    default:
                        nodes.push(makePseudo(op, [], pos));
                        break;
                }
                continue;
            }
            if (instr.type === "macroInvoke") {
                const pos = locToPos(ctx, instr.pos ?? item.pos);
                const op = String(instr.name).toUpperCase();
                const invokeArgs = (instr.args ?? []).map((a) => (a == null ? "" : String(a)));
                const isOpcode = !!ctx.opcodes?.has((0, context_1.canon)(op, ctx));
                // "CP" のような opcode 名が parser 都合で macroInvoke 扱いに落ちた場合は、
                // 未定義マクロとして飲み込まずに構文エラーとして止める。
                if (isOpcode && invokeArgs.length === 0 && !hasMacro(instr.name)) {
                    throw new Error(`Syntax error: missing operand(s) for opcode '${op}' at line ${pos.line + 1}`);
                }
                if (pseudoOps.has(op)) {
                    if (op === "DEFL") {
                        if (invokeArgs.length >= 2) {
                            nodes.push(makePseudo("SET", [{ key: String(invokeArgs[0]), value: String(invokeArgs[1]) }], pos));
                        }
                        else {
                            nodes.push(makePseudo("SET", [], pos));
                        }
                        continue;
                    }
                    if (op === "DEFM") {
                        nodes.push(makePseudo("DB", invokeArgs.map((a) => ({ value: String(a) })), pos));
                        continue;
                    }
                    if (op === "IFIDN" || op === "IFDIF") {
                        if (invokeArgs.length >= 2) {
                            nodes.push(makePseudo(op, [{ value: String(invokeArgs[0]) }, { value: String(invokeArgs[1]) }], pos));
                        }
                        else {
                            nodes.push(makePseudo(op, invokeArgs.map((a) => ({ value: String(a) })), pos));
                        }
                        continue;
                    }
                    if (op === "EXTERNAL" || op === "EXT") {
                        nodes.push(makePseudo(op, invokeArgs.map((a) => ({ value: String(a) })), pos));
                        continue;
                    }
                    nodes.push(makePseudo(op, invokeArgs.map((a) => ({ value: String(a) })), pos));
                    continue;
                }
                nodes.push({ kind: "macroInvoke", name: instr.name, args: invokeArgs, pos });
                continue;
            }
            if (instr.type === "instruction" && pseudoOps.has(instr.mnemonic.toUpperCase())) {
                const pos = locToPos(ctx, instr.pos ?? item.pos);
                const op = instr.mnemonic.toUpperCase();
                // Simple pseudo ops without args
                if (["END", "ELSE", "ENDIF", "ENDM", "ENDR"].includes(op)) {
                    nodes.push(makePseudo(op, [], pos));
                }
                else if (op === "EQU") {
                    // EQU symbol value
                    const args = instr.operands ?? [];
                    if (args.length >= 2) {
                        nodes.push(makePseudo("EQU", [{ key: String(args[0]), value: String(args[1]) }], pos));
                    }
                }
                else if (op === "SET") {
                    const args = instr.operands ?? [];
                    if (args.length >= 2) {
                        nodes.push(makePseudo("SET", [{ key: String(args[0]), value: String(args[1]) }], pos));
                    }
                }
                else if (op === "IF") {
                    const args = instr.operands ?? [];
                    if (args.length >= 1) {
                        nodes.push(makePseudo("IF", [{ value: String(args[0]) }], pos));
                    }
                }
                else if (op === "ELSEIF") {
                    const args = instr.operands ?? [];
                    if (args.length >= 1) {
                        nodes.push(makePseudo("ELSEIF", [{ value: String(args[0]) }], pos));
                    }
                }
                else if (op === "IFIDN") {
                    const args = instr.operands ?? [];
                    if (args.length >= 2) {
                        nodes.push(makePseudo("IFIDN", [{ value: String(args[0]) }, { value: String(args[1]) }], pos));
                    }
                }
                else if (op === "ORG") {
                    const args = instr.operands ?? [];
                    if (args.length >= 1) {
                        nodes.push(makePseudo("ORG", [{ value: String(args[0]) }], pos));
                    }
                }
                else if (["DB", "DEFB", "DW", "DEFW", "DS", "DEFS", "DZ"].includes(op)) {
                    const args = instr.operands ?? [];
                    nodes.push(makePseudo(op, args.map((a) => ({ value: String(a) })), pos));
                }
                else if (op === "INCLUDE") {
                    const args = instr.operands ?? [];
                    if (args.length >= 1) {
                        nodes.push(makePseudo("INCLUDE", [{ value: String(args[0]) }], pos));
                    }
                }
                else if (op === "EXTERN") {
                    const args = instr.operands ?? [];
                    nodes.push(makePseudo("EXTERN", args.map((a) => ({ value: String(a) })), pos));
                }
                else if (op === "SECTION") {
                    const args = instr.operands ?? [];
                    if (args.length >= 1) {
                        nodes.push(makePseudo("SECTION", [{ value: String(args[0]) }], pos));
                    }
                }
                else if (op === "ALIGN") {
                    const args = instr.operands ?? [];
                    if (args.length >= 1) {
                        nodes.push(makePseudo("ALIGN", [{ value: String(args[0]) }], pos));
                    }
                }
                else if (op === ".SYMLEN") {
                    const args = instr.operands ?? [];
                    nodes.push(makePseudo(".SYMLEN", args.length > 0 ? [{ value: String(args[0]) }] : [], pos));
                }
                else if (op === ".WORD32") {
                    nodes.push(makePseudo(".WORD32", [], pos));
                }
                else {
                    // Unknown pseudo
                    nodes.push(makePseudo(op, [], pos));
                }
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

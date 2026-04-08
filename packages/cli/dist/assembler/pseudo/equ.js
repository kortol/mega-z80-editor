"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleEQU = handleEQU;
exports.handleSYMLEN = handleSYMLEN;
const context_1 = require("../context");
const errors_1 = require("../errors");
const tokenizer_1 = require("../tokenizer");
const parserExpr_1 = require("../expr/parserExpr");
const eval_1 = require("../expr/eval");
function handleEQU(ctx, node) {
    if (ctx.phase !== "analyze")
        return;
    if (node.args.length !== 1) {
        throw new Error(`EQU requires two arguments at line ${node.pos.line}`);
    }
    // PseudoArg形式: { key: "FOO", value: "10" }
    const key = node.args[0].key ?? "";
    const valStr = node.args[0].value ?? "";
    if (!key) {
        throw new Error(`EQU missing symbol name at line ${node.pos.line}`);
    }
    // 大文字小文字処理
    let sym = ctx.caseInsensitive ? key.toUpperCase() : key;
    // シンボル長制限
    if (sym.length > ctx.modeSymLen) {
        const truncated = sym.substring(0, ctx.modeSymLen);
        ctx.warnings.push((0, errors_1.makeWarning)(errors_1.AssemblerErrorCode.ExprOutRange, `Symbol '${sym}' truncated to '${truncated}'`, { pos: ctx.currentPos }));
        sym = truncated; // ← 登録キーを更新
    }
    // 即値を評価（EQUは式を許可）
    const tokens = (0, tokenizer_1.tokenize)(ctx, valStr).filter((t) => t.kind !== "eol");
    const e = (0, parserExpr_1.parseExpr)(tokens);
    const evalCtx = (0, eval_1.makeEvalCtx)(ctx);
    const res = (0, eval_1.evalExpr)(e, evalCtx);
    if (res.kind !== "Const") {
        ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprNotConstant, `EQU value must be constant at line ${node.pos.line}`));
        throw new Error(`EQU value must be constant at line ${node.pos.line}`);
    }
    const val = res.value;
    // 既存シンボルとの衝突確認
    if (ctx.symbols.has(sym)) {
        const prev = ctx.symbols.get(sym);
        if (prev && prev.value !== val) {
            ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.RedefSymbol, `Redefinition of symbol '${sym}' at line ${node.pos.line}`));
            throw new Error(`Symbol '${sym}' redefined at line ${node.pos.line}`);
        }
    }
    (0, context_1.defineSymbol)(ctx, sym, val, "CONST", node.pos);
}
function handleSYMLEN(ctx, node) {
    const arg = node.args?.[0]?.value ?? "32";
    ctx.modeSymLen = parseInt(arg, 10);
}

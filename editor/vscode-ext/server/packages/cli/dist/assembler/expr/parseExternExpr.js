"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExternExpr = parseExternExpr;
const tokenizer_1 = require("../tokenizer");
const parserExpr_1 = require("./parserExpr");
const eval_1 = require("./eval");
/**
 * 外部シンボル参照をパースし、Reloc可能かを返す。
 * extern名 + 定数 の形式を許可。
 */
function parseExternExpr(ctx, expr) {
    const tokens = (0, tokenizer_1.tokenize)(ctx, expr).filter(t => t.kind !== "eol");
    const e = (0, parserExpr_1.parseExpr)(tokens);
    // EvalContextをAssembleContextから派生
    const evalCtx = {
        symbols: ctx.symbols,
        externs: ctx.externs,
        pass: 1,
        errors: ctx.errors,
        visiting: new Set(),
        loc: ctx.loc,
        currentGlobalLabel: ctx.currentGlobalLabel,
        caseInsensitive: ctx.caseInsensitive,
    };
    const res = (0, eval_1.evalExpr)(e, evalCtx);
    if (res.kind === "Reloc") {
        return {
            symbol: res.sym,
            addend: res.addend,
        };
    }
    return null;
}

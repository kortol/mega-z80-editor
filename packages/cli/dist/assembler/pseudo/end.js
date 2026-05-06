"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleEND = handleEND;
const parserExpr_1 = require("../expr/parserExpr");
const eval_1 = require("../expr/eval");
const errors_1 = require("../errors");
const tokenizer_1 = require("../tokenizer");
function handleEND(ctx, node) {
    if (node.kind !== "pseudo" || node.op !== "END")
        return;
    // ENDに到達
    ctx.endReached = true;
    if (node.args.length === 0) {
        // END (引数なし) → entry未定義
        ctx.entry = undefined;
        return;
    }
    // END expr
    // ★ EOL を除去してから parseExpr
    const exprText = node.args.map(a => a.value).join(" ");
    const tokens = (0, tokenizer_1.tokenize)(ctx, exprText).filter((t) => t.kind !== "eol");
    const expr = (0, parserExpr_1.parseExpr)(tokens);
    const evalCtx = (0, eval_1.makeEvalCtx)(ctx);
    const res = (0, eval_1.evalExpr)(expr, evalCtx);
    if (res.kind === "Const") {
        ctx.entry = res.value;
    }
    else if (res.kind === "Reloc") {
        // evalExpr が A2100 を積んでいる可能性を消す
        ctx.errors = ctx.errors.filter((e) => e.code !== errors_1.AssemblerErrorCode.ExprUndefinedSymbol);
        // 外部シンボルはエントリ不可
        ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprExternInEnd, `External symbol not allowed in END: ${node.args.map(a => a.value).join(" ")}`));
        ctx.entry = undefined;
    }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDEFINE = handleDEFINE;
const context_1 = require("../context");
const parserExpr_1 = require("../expr/parserExpr");
const eval_1 = require("../expr/eval");
const tokenizer_1 = require("../tokenizer");
function handleDEFINE(ctx, node) {
    const first = node.args?.[0];
    const second = node.args?.[1];
    const key = (first?.key ?? first?.value ?? "").trim();
    const raw = first?.key ? (first?.value ?? "") : (second?.value ?? "");
    if (!key)
        return;
    const text = raw.trim();
    if ((text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'"))) {
        ctx.stringDefines ??= new Map();
        ctx.stringDefines.set((0, context_1.canon)(key, ctx), text);
        (0, context_1.defineSymbol)(ctx, key, 0, "CONST", node.pos);
        return;
    }
    const tokens = (0, tokenizer_1.tokenize)(ctx, text).filter((t) => t.kind !== "eol");
    if (tokens.length === 0) {
        (0, context_1.defineSymbol)(ctx, key, 0, "CONST", node.pos);
        return;
    }
    const expr = (0, parserExpr_1.parseExpr)(tokens);
    const result = (0, eval_1.evalExpr)(expr, (0, eval_1.makeEvalCtx)(ctx));
    if (result.kind === "Const") {
        (0, context_1.defineSymbol)(ctx, key, result.value, "CONST", node.pos);
        return;
    }
    (0, context_1.defineSymbol)(ctx, key, 0, "CONST", node.pos);
}

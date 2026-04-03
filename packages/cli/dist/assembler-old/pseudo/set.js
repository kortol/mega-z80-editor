"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSET = handleSET;
const errors_1 = require("../errors");
const eval_1 = require("../expr/eval");
const parserExpr_1 = require("../expr/parserExpr");
const tokenizer_1 = require("../tokenizer");
function handleSET(ctx, node) {
    if (ctx.phase !== "analyze")
        return;
    if (node.args.length !== 1) {
        ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.SyntaxError, `SET requires two arguments at line ${node.pos.line}`, { pos: node.pos }));
        return;
    }
    const key = node.args[0].key ?? "";
    const valStr = node.args[0].value ?? "";
    if (!key) {
        ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.SyntaxError, `SET missing symbol name at line ${node.pos.line}`, { pos: node.pos }));
        return;
    }
    const sym = ctx.caseInsensitive ? key.toUpperCase() : key;
    const tokens = (0, tokenizer_1.tokenize)(ctx, valStr).filter((t) => t.kind !== "eol");
    const e = (0, parserExpr_1.parseExpr)(tokens);
    const evalCtx = {
        symbols: ctx.symbols,
        externs: ctx.externs,
        pass: 1,
        errors: ctx.errors,
        visiting: new Set(),
        loc: ctx.loc,
    };
    const res = (0, eval_1.evalExpr)(e, evalCtx);
    if (res.kind !== "Const") {
        ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprNotConstant, `SET value must be constant at line ${node.pos.line}`, { pos: node.pos }));
        return;
    }
    ctx.symbols.set(sym, {
        value: res.value,
        sectionId: ctx.currentSection ?? 0,
        type: "CONST",
    });
}

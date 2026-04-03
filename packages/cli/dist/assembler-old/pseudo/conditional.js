"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isConditionalOp = isConditionalOp;
exports.isConditionActive = isConditionActive;
exports.handleConditional = handleConditional;
const errors_1 = require("../errors");
const eval_1 = require("../expr/eval");
const parserExpr_1 = require("../expr/parserExpr");
const tokenizer_1 = require("../tokenizer");
function isConditionalOp(op) {
    const u = op.toUpperCase();
    return u === "IF" || u === "ELSEIF" || u === "ELSE" || u === "ENDIF" || u === "IFIDN";
}
function isConditionActive(ctx) {
    if (!ctx.condStack?.length)
        return true;
    return ctx.condStack.every((f) => f.active);
}
function evalConditionExpr(ctx, exprText, pos) {
    const text = exprText?.trim() ?? "";
    if (!text)
        return false;
    const tokens = (0, tokenizer_1.tokenize)(ctx, text).filter((t) => t.kind !== "eol");
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
    if (res.kind === "Const")
        return res.value !== 0;
    ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.ExprNotConstant, `Conditional expression is not constant: ${exprText}`, { pos }));
    return false;
}
function normalizeIdn(ctx, raw) {
    let s = (raw ?? "").trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1);
    }
    return ctx.caseInsensitive ? s.toUpperCase() : s;
}
function evalIfIdn(ctx, node) {
    const left = node.args?.[0]?.value ?? "";
    const right = node.args?.[1]?.value ?? "";
    if (!left || !right) {
        ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.SyntaxError, "IFIDN requires two arguments", { pos: node.pos }));
        return false;
    }
    return normalizeIdn(ctx, left) === normalizeIdn(ctx, right);
}
function handleConditional(ctx, node) {
    const op = node.op.toUpperCase();
    if (!ctx.condStack)
        ctx.condStack = [];
    const stack = ctx.condStack;
    if (op === "IF" || op === "IFIDN") {
        const parentActive = isConditionActive(ctx);
        const cond = parentActive
            ? (op === "IF" ? evalConditionExpr(ctx, node.args?.[0]?.value ?? "", node.pos) : evalIfIdn(ctx, node))
            : false;
        stack.push({
            parentActive,
            active: parentActive && cond,
            satisfied: parentActive && cond,
        });
        return;
    }
    if (op === "ELSEIF") {
        if (stack.length === 0) {
            ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.SyntaxError, "ELSEIF without IF", { pos: node.pos }));
            return;
        }
        const frame = stack[stack.length - 1];
        if (frame.elseSeen) {
            ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.SyntaxError, "ELSEIF after ELSE", { pos: node.pos }));
            return;
        }
        if (!frame.parentActive) {
            frame.active = false;
            return;
        }
        if (frame.satisfied) {
            frame.active = false;
            return;
        }
        const cond = evalConditionExpr(ctx, node.args?.[0]?.value ?? "", node.pos);
        frame.active = cond;
        if (cond)
            frame.satisfied = true;
        return;
    }
    if (op === "ELSE") {
        if (stack.length === 0) {
            ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.SyntaxError, "ELSE without IF", { pos: node.pos }));
            return;
        }
        const frame = stack[stack.length - 1];
        if (frame.elseSeen) {
            ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.SyntaxError, "Duplicate ELSE", { pos: node.pos }));
            return;
        }
        frame.elseSeen = true;
        if (!frame.parentActive) {
            frame.active = false;
            return;
        }
        if (frame.satisfied) {
            frame.active = false;
            return;
        }
        frame.active = true;
        frame.satisfied = true;
        return;
    }
    if (op === "ENDIF") {
        if (stack.length === 0) {
            ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.SyntaxError, "ENDIF without IF", { pos: node.pos }));
            return;
        }
        stack.pop();
        return;
    }
}

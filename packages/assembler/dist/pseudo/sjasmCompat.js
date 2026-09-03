"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSjasmCompatRaw = resolveSjasmCompatRaw;
exports.resolveSjasmCompatNumber = resolveSjasmCompatNumber;
const context_1 = require("../context");
const utils_1 = require("../encoder/utils");
function splitArrayAccess(expr) {
    const trimmed = expr.trim();
    const start = trimmed.indexOf("[");
    if (start <= 0 || !trimmed.endsWith("]"))
        return null;
    return {
        name: trimmed.slice(0, start).trim(),
        indexExpr: trimmed.slice(start + 1, -1).trim(),
    };
}
function resolveSjasmCompatRaw(ctx, expr, pos) {
    const trimmed = expr.trim();
    if (!trimmed)
        return null;
    const defineKey = (0, context_1.canon)(trimmed, ctx);
    const stringDefine = ctx.stringDefines?.get(defineKey);
    if (stringDefine != null)
        return stringDefine;
    const access = splitArrayAccess(trimmed);
    if (!access)
        return null;
    const values = ctx.sjasmArrays?.get((0, context_1.canon)(access.name, ctx));
    if (!values)
        return null;
    const index = resolveSjasmCompatNumber(ctx, access.indexExpr, pos);
    if (index == null || index < 0 || index >= values.length)
        return null;
    return values[index];
}
function resolveSjasmCompatNumber(ctx, expr, pos) {
    const compat = resolveSjasmCompatRaw(ctx, expr, pos);
    if (compat == null) {
        try {
            return (0, utils_1.resolveExpr16)(ctx, expr, pos);
        }
        catch {
            return null;
        }
    }
    try {
        return (0, utils_1.resolveExpr16)(ctx, compat, pos);
    }
    catch {
        return null;
    }
}

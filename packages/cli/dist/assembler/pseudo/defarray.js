"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDEFARRAY = handleDEFARRAY;
const context_1 = require("../context");
function handleDEFARRAY(ctx, node) {
    const first = node.args?.[0];
    const key = (first?.key ?? first?.value ?? "").trim();
    if (!key)
        return;
    const values = (node.args ?? []).slice(1).map((arg) => String(arg?.value ?? "").trim());
    ctx.sjasmArrays ??= new Map();
    ctx.sjasmArrays.set((0, context_1.canon)(key, ctx), values);
}

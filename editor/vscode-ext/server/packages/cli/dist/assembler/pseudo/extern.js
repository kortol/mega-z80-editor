"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleEXTERN = handleEXTERN;
const errors_1 = require("../errors");
function handleEXTERN(ctx, node) {
    const [sym, fromKw, file] = node.args;
    if (!sym || !sym.value) {
        ctx.errors.push({
            code: errors_1.AssemblerErrorCode.ExternMissingSymbol,
            message: "EXTERN requires a symbol",
            pos: node.pos,
        });
        return;
    }
    // 参照は作らない。宣言だけ
    ctx.externs.add(sym?.value.toUpperCase());
    // FROM "libfile" は今は無視
    if (fromKw?.value.toUpperCase() === "FROM") {
        // 将来ライブラリ対応時に処理する
    }
}

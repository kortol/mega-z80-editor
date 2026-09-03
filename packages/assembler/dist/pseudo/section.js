"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSECTION = handleSECTION;
const emit_1 = require("../codegen/emit");
/**
 * SECTION 擬似命令
 *   SECTION TEXT
 *   SECTION DATA
 *   SECTION BSS
 *   SECTION .custom
 */
function handleSECTION(ctx, node, attrs) {
    // nodeが文字列で渡された場合もサポート（テストや内部呼び出し用）
    const name = typeof node === "string" ? node : node.args?.[0]?.value ?? "TEXT";
    // emitSection に責務を委譲
    (0, emit_1.emitSection)(ctx, name, attrs);
    if (ctx.options?.verbose) {
        const sec = ctx.sections.get(ctx.currentSection);
        console.log(`Switched to section ${sec?.name} (id=${sec?.id}) at loc=${ctx.loc}`);
    }
}

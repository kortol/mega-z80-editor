"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleORG = handleORG;
const utils_1 = require("../encoder/utils");
const errors_1 = require("../errors"); // 既存makeErrorを利用
function handleORG(ctx, node) {
    if (node.args.length !== 1) {
        throw new Error(`ORG requires exactly one argument at line ${node.pos.line}`);
    }
    const arg = node.args[0];
    const inValue = arg.value;
    const val = (0, utils_1.resolveExpr16)(ctx, inValue, node.pos, true, true);
    // 未定義シンボルはエラーにする（ORGは relocatable じゃないので）
    if (val === null) {
        throw new Error(`ORG with unresolved symbol '${inValue}' at line ${node.pos.line}`);
    }
    // --- 🩹 フォールバック: sections未定義なら旧動作 ---
    if (!ctx.sections || !ctx.sections.size) {
        ctx.loc = val;
        return;
    }
    const sec = ctx.sections.get(ctx.currentSection);
    // LC逆行禁止チェック
    if (val < sec.lc) {
        ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.OrgBackward, `ORG moved backward in section ${sec.name} (line ${node.pos.line})`));
        return;
    }
    // セクションのLC更新
    sec.lc = val;
    // 現在位置同期
    ctx.loc = val; // ← 古いAPIとの互換性維持（既存命令エンコーダが使っているため）
}

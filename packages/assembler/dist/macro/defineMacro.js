"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineMacro = defineMacro;
const errors_1 = require("../errors");
const context_1 = require("../context");
const path_1 = __importDefault(require("path"));
function defineMacro(name, params, bodyTokens, ctx, defPos, isLocal = false) {
    const key = (0, context_1.canon)(name, ctx);
    // 🟩 ローカルマクロの場合は現在スコープのトップに登録
    let targetTable;
    if (isLocal) {
        const top = ctx.macroTableStack.at(-1);
        if (!top) {
            ctx.errors.push({
                code: errors_1.AssemblerErrorCode.SyntaxError,
                message: `LOCALMACRO '${name}' defined outside of any MACRO scope.`,
                pos: defPos,
            });
            return;
        }
        targetTable = top;
    }
    else {
        targetTable = ctx.macroTable;
    }
    ctx.seenMacroSites ??= new Set();
    const fileKey = defPos.file ? path_1.default.resolve(defPos.file) : "(nofile)";
    const site = `${fileKey}:${defPos.line}:${key}`;
    if (ctx.seenMacroSites.has(site)) {
        return; // 同一サイトからの重複（フェーズ跨ぎ含む）は無視
    }
    // --- すでに登録済みならスキップ（同一位置は二重登録とみなさない） ---
    const existing = targetTable.get(key);
    if (existing) {
        // 同じ定義位置なら単なる再解析なので無視
        if (existing.pos.file === defPos.file &&
            existing.pos.line === defPos.line) {
            ctx.seenMacroSites.add(site);
            return;
        }
        // 異なる位置なら「再定義」として通常エラー
        ctx.errors.push({
            code: errors_1.AssemblerErrorCode.MacroRedefined,
            message: `Macro '${name}' already defined`,
            pos: defPos,
        });
        return;
    }
    // --- 命令名衝突チェック ---
    if (!isLocal && ctx.opcodes.has(key)) {
        if (ctx.options.strictMacro) {
            ctx.errors.push({
                code: errors_1.AssemblerErrorCode.MacroNameReserved,
                message: `Cannot redefine instruction '${name}' as a macro.`,
                pos: defPos,
            });
            return; // 定義しない
        }
        else {
            ctx.warnings.push((0, errors_1.makeWarning)(errors_1.AssemblerErrorCode.MacroOverridesInstr, `Macro '${name}' overrides Z80 instruction.`, { pos: defPos }));
        }
    }
    targetTable.set(key, {
        kind: "macroDef",
        name,
        params,
        bodyTokens,
        pos: defPos,
        startPos: defPos, // 仮
        endPos: defPos, // 仮
        isLocal
    });
}

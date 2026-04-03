"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleInclude = handleInclude;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const tokenizer_1 = require("../tokenizer");
const parser_1 = require("../parser");
const pegAdapter_1 = require("../../assembler/parser/pegAdapter");
const context_1 = require("../context");
const errors_1 = require("../errors");
// 🔹 パス解決（相対／INCLUDEPATH対応）
function resolveIncludePath(fileName, ctx) {
    const baseDir = path_1.default.dirname(ctx.currentPos.file);
    const abs1 = path_1.default.resolve(baseDir, fileName);
    if (fs_1.default.existsSync(abs1))
        return abs1;
    if (ctx.includePaths) {
        for (const dir of ctx.includePaths) {
            const candidate = path_1.default.resolve(dir, fileName);
            if (fs_1.default.existsSync(candidate))
                return candidate;
        }
    }
    return null;
}
// 🔹 INCLUDEノード展開（仮想ファイル対応版）
function handleInclude(ctx, node) {
    const incName = node.args[0]?.value;
    if (!incName) {
        throw (0, errors_1.makeError)(errors_1.AssemblerErrorCode.IncludeSyntaxError, "INCLUDE expects a string literal");
    }
    const usePeg = ctx.options?.parser === "peg";
    const parseSource = (src) => {
        if (usePeg)
            return (0, pegAdapter_1.parsePeg)(ctx, src);
        const tokens = (0, tokenizer_1.tokenize)(ctx, src);
        return (0, parser_1.parse)(ctx, tokens);
    };
    // 🟩 仮想ファイルシステム優先
    if (ctx.options.virtualFiles && ctx.options.virtualFiles.get(incName)) {
        ctx.logger?.info(`[include] virtual file: ${incName}`);
        const src = ctx.options.virtualFiles.get(incName) ?? '';
        // ✅ ソースキャッシュ登録
        if (!ctx.sourceMap)
            ctx.sourceMap = new Map();
        ctx.sourceMap.set(incName, src.split(/\r?\n/));
        const parentPos = (0, context_1.cloneSourcePos)(ctx.currentPos);
        const newPos = (0, context_1.createSourcePos)(incName, 0, 0, ctx.phase, parentPos);
        ctx.currentPos = newPos;
        const subNodes = parseSource(src);
        // ✅ 子ノードの pos.parent に親を設定
        for (const n of subNodes) {
            if (n.pos && !n.pos.parent) {
                n.pos.parent = parentPos;
            }
        }
        ctx.currentPos = parentPos;
        return subNodes;
    }
    // --- 実ファイル読み込み（従来ロジック） ---
    const absPath = resolveIncludePath(incName, ctx);
    if (!absPath) {
        throw (0, errors_1.makeError)(errors_1.AssemblerErrorCode.IncludeNotFound, `File not found: ${incName}`);
    }
    // 循環検出
    if (ctx.includeStack.some(f => f.file === absPath)) {
        throw (0, errors_1.makeError)(errors_1.AssemblerErrorCode.IncludeLoop, `Circular include: ${absPath}`);
    }
    // 重複防止
    if (ctx.includeCache.has(absPath)) {
        ctx.warnings.push((0, errors_1.makeWarning)(errors_1.AssemblerErrorCode.IncludeDuplicate, `Duplicate include skipped: ${absPath}`, { pos: ctx.currentPos }));
        return [];
    }
    // if (ctx.verbose) {
    ctx.logger?.info(`ctx.currentFile:${ctx.currentPos.file}`);
    // }
    ctx.includeCache.add(absPath);
    const src = fs_1.default.readFileSync(absPath, "utf8");
    ctx.logger?.info(`include file:${absPath}`);
    ctx.logger?.info(`${src}`);
    // ✅ ソースキャッシュ登録
    if (!ctx.sourceMap)
        ctx.sourceMap = new Map();
    ctx.sourceMap.set(absPath, src.split(/\r?\n/));
    ctx.includeStack.push({ file: absPath, lines: [node.pos.line] });
    try {
        // ✅ 現在位置を親として、新しい SourcePos を生成
        const parentPos = (0, context_1.cloneSourcePos)(ctx.currentPos);
        const newPos = (0, context_1.createSourcePos)(absPath, 0, 0, ctx.phase, parentPos);
        ctx.currentPos = newPos;
        const subNodes = parseSource(src);
        // ✅ 子ノードの pos.parent に親を設定
        for (const n of subNodes) {
            if (n.pos && !n.pos.parent) {
                n.pos.parent = parentPos;
            }
        }
        // ✅ 親に戻す
        ctx.currentPos = parentPos;
        return subNodes;
    }
    finally {
        ctx.includeStack.pop();
    }
}

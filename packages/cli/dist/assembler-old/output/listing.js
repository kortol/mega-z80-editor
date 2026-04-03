"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeLstFile = writeLstFile;
exports.writeLstFileV2 = writeLstFileV2;
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * `.lst` ファイル出力（従来形式）
 * - 各行：アドレス＋ダンプ＋ソース
 * - INCLUDEコメントやセクション見出しなし（v1互換）
 */
function writeLstFile(ctx, outputFile, source) {
    const lstPath = outputFile.replace(/\.rel$/i, ".lst");
    const lines = [];
    const srcLines = source.split(/\r?\n/);
    // emit順を保証
    const texts = [...ctx.texts].sort((a, b) => a.addr - b.addr);
    for (const t of texts) {
        const bytes = t.data
            .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
            .join(" ");
        // --- line補完（undefined対策） ---
        const lineNo = t.pos.line && t.pos.line > 0 ? t.pos.line : 1;
        const src = srcLines[lineNo - 1]?.trim() ?? "";
        lines.push(`${t.addr.toString(16).padStart(4, "0").toUpperCase()}  ${bytes.padEnd(12)}  ${src}`);
    }
    fs.writeFileSync(lstPath, lines.join("\n") + "\n", "utf-8");
}
/**
 * `.lst` ファイル出力（新形式 / v2仕様）
 * INCLUDE展開を可視化し、可読性を高める。
 */
function writeLstFileV2(ctx, outputFile, _source) {
    const lstPath = outputFile.replace(/\.rel$/i, ".lst");
    const lines = [];
    const texts = [...ctx.texts].sort((a, b) => a.addr - b.addr);
    let prevStack = [];
    for (const t of texts) {
        const stack = getIncludeStack(t.pos);
        const diff = getStackDiff(prevStack, stack);
        // include 開始（深くなった分だけ）
        for (const f of diff.entered) {
            lines.push(`;#include <${path_1.default.basename(f)}>`);
        }
        // include 終了（浅くなった分だけ）
        for (const f of diff.exited.reverse()) {
            lines.push(`;#endinclude (${path_1.default.basename(f)})`);
        }
        // --- 🔹 ファイルごとのソース取得
        const fileSrc = ctx.sourceMap?.get(t.pos.file) ?? [];
        const srcLine = fileSrc[t.pos.line]?.trim() ?? "";
        // 通常行
        const bytes = t.data.map(b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
        // lines.push(
        //   `${t.addr.toString(16).padStart(4, "0").toUpperCase()}  ${bytes.padEnd(9)}  ${getSourceSummary(t.pos)}`
        // );
        lines.push(`${t.addr.toString(16).padStart(4, "0").toUpperCase()}  ${bytes.padEnd(9)}       ${srcLine}`);
        prevStack = stack;
    }
    // 終了時にすべて閉じる
    for (const f of prevStack.reverse()) {
        lines.push(`;#endinclude (${path_1.default.basename(f)})`);
    }
    fs.writeFileSync(lstPath, lines.join("\n") + "\n", "utf-8");
}
/**
 * 現在のposから親方向にファイル階層をたどる
 */
function getIncludeStack(pos) {
    const stack = [];
    let p = pos;
    while (p) {
        stack.unshift(p.file);
        p = p.parent;
    }
    return stack;
}
/**
 * includeスタックの差分を計算
 */
function getStackDiff(prev, next) {
    let i = 0;
    while (i < prev.length && i < next.length && prev[i] === next[i])
        i++;
    return {
        exited: prev.slice(i),
        entered: next.slice(i),
    };
}
/**
 * posから短いソース位置情報を返す（例: "LD A,3"）
 * 現状はpos.lineを無視しても問題ない（構文トレース専用）
 */
function getSourceSummary(pos) {
    const f = path_1.default.basename(pos.file);
    return `INCLUDE "${f}"`; // 仮に今は簡易表示、必要ならctx.sourceMap参照で本来の行を表示
}

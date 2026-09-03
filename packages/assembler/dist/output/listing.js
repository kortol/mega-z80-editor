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
        // pos.line is 0-based in assembler internals.
        const lineIdx = Number.isInteger(t.pos.line) && t.pos.line >= 0 ? t.pos.line : 0;
        const src = srcLines[lineIdx]?.trim() ?? "";
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
    const sections = Array.from(ctx.sections.values()).sort((a, b) => a.id - b.id);
    const entries = ctx.listing ?? ctx.texts.map(t => ({
        addr: t.addr,
        bytes: t.data,
        pos: t.pos,
        sectionId: t.sectionId,
    }));
    for (const sec of sections) {
        const texts = entries
            .filter(t => t.sectionId === sec.id)
            .sort((a, b) => a.addr - b.addr);
        if (texts.length === 0)
            continue;
        lines.push(`; --- SECTION: ${sec.name} ---`);
        let prevStack = [];
        let stackInfo = [];
        for (const t of texts) {
            stackInfo = getIncludeStackInfo(t.pos);
            const stack = stackInfo.map(s => s.file);
            const diff = getStackDiff(prevStack, stack);
            const infoByFile = new Map(stackInfo.map(s => [s.file, s]));
            // include 開始（深くなった分だけ）
            for (const f of diff.entered) {
                const info = infoByFile.get(f);
                lines.push(formatIncludeEnter(info));
            }
            // include 終了（浅くなった分だけ）
            for (const f of diff.exited.reverse()) {
                lines.push(`;#endinclude (${path_1.default.basename(f)})`);
            }
            // --- 🔹 ファイルごとのソース取得
            const fileSrc = ctx.sourceMap?.get(t.pos.file) ?? [];
            const srcLine = fileSrc[t.pos.line]?.trim() ?? "";
            const text = t.text ?? srcLine;
            const mask = buildRelocMask(ctx, sec.id, t.addr, t.bytes.length, t.pos.file, t.pos.line);
            const dump = writeDumpLine(t.addr, t.bytes, text, mask);
            if (dump)
                lines.push(...dump.split("\n"));
            prevStack = stack;
        }
        // 終了時にすべて閉じる（セクション単位）
        for (const f of prevStack.reverse()) {
            lines.push(`;#endinclude (${path_1.default.basename(f)})`);
        }
    }
    fs.writeFileSync(lstPath, lines.join("\n") + "\n", "utf-8");
}
function getIncludeStackInfo(pos) {
    const stack = [];
    let p = pos;
    while (p) {
        stack.unshift({
            file: p.file,
            parentFile: p.parent?.file,
            parentLine: p.parent?.line,
        });
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
function writeDumpLine(addr, bytes, text, relocMask) {
    const src = (text ?? "").trimEnd();
    if (src.trimStart().startsWith(";")) {
        return src;
    }
    const addrStr = addr.toString(16).padStart(4, "0").toUpperCase();
    if (!bytes || bytes.length === 0) {
        return src;
    }
    const hex = bytes.map((b, i) => relocMask?.[i] ? "**" : b.toString(16).padStart(2, "0").toUpperCase());
    const lines = [];
    for (let i = 0; i < hex.length; i += 4) {
        const chunk = hex.slice(i, i + 4).join(" ");
        const chunkStr = chunk.padEnd(9, " ");
        if (i === 0) {
            lines.push(`${addrStr}  ${chunkStr}       ${src}`.trimEnd());
        }
        else {
            lines.push(`    ${chunkStr}`.trimEnd());
        }
    }
    return lines.join("\n");
}
function buildRelocMask(ctx, sectionId, addr, len, file, line) {
    const mask = new Array(len).fill(false);
    const unresolved = ctx.unresolved ?? [];
    for (const u of unresolved) {
        if ((u.sectionId ?? sectionId) !== sectionId)
            continue;
        let marked = false;
        const sz = Math.max(0, u.size ?? 0);
        for (let i = 0; i < sz; i++) {
            const p = u.addr + i - addr;
            if (p >= 0 && p < len) {
                mask[p] = true;
                marked = true;
            }
        }
        if (marked)
            continue;
        // Fallback: when relocation address cannot be mapped exactly, mark tail bytes on same source line.
        if (u.requester?.pos?.file === file && u.requester?.pos?.line === line && sz > 0) {
            for (let i = 0; i < Math.min(sz, len); i++) {
                mask[len - 1 - i] = true;
            }
        }
    }
    return mask;
}
function formatIncludeEnter(info) {
    if (!info)
        return ";#include";
    const file = path_1.default.basename(info.file);
    if (info.parentFile) {
        const parent = path_1.default.basename(info.parentFile);
        const line = (info.parentLine ?? 0) + 1;
        return `;#include "${file}" (from ${parent} line ${line})`;
    }
    return `;#include "${file}"`;
}

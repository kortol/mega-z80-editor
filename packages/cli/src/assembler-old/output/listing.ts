import * as fs from "fs";
import path from "path";
import { AsmContext, LstEntry, SourcePos } from "../context";

/**
 * `.lst` ファイル出力（従来形式）
 * - 各行：アドレス＋ダンプ＋ソース
 * - INCLUDEコメントやセクション見出しなし（v1互換）
 */
export function writeLstFile(ctx: AsmContext, outputFile: string, source: string) {
  const lstPath = outputFile.replace(/\.rel$/i, ".lst");
  const lines: string[] = [];
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

    lines.push(
      `${t.addr.toString(16).padStart(4, "0").toUpperCase()}  ${bytes.padEnd(12)}  ${src}`
    );
  }

  fs.writeFileSync(lstPath, lines.join("\n") + "\n", "utf-8");
}

/**
 * `.lst` ファイル出力（新形式 / v2仕様）
 * INCLUDE展開を可視化し、可読性を高める。
 */
export function writeLstFileV2(ctx: AsmContext, outputFile: string, _source: string) {
  const lstPath = outputFile.replace(/\.rel$/i, ".lst");
  const lines: string[] = [];

  const sections = Array.from(ctx.sections.values()).sort((a, b) => a.id - b.id);
  const entries: LstEntry[] = ctx.listing ?? ctx.texts.map(t => ({
    addr: t.addr,
    bytes: t.data,
    pos: t.pos,
    sectionId: t.sectionId,
  }));

  for (const sec of sections) {
    const texts = entries
      .filter(t => t.sectionId === sec.id)
      .sort((a, b) => a.addr - b.addr);

    if (texts.length === 0) continue;

    lines.push(`; --- SECTION: ${sec.name} ---`);

    let prevStack: string[] = [];
    let stackInfo: IncludeFrameInfo[] = [];

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
        lines.push(`;#endinclude (${path.basename(f)})`);
      }

      // --- 🔹 ファイルごとのソース取得
      const fileSrc = ctx.sourceMap?.get(t.pos.file) ?? [];
      const srcLine = fileSrc[t.pos.line]?.trim() ?? "";
      const text = t.text ?? srcLine;

      const dump = writeDumpLine(t.addr, t.bytes, text);
      if (dump) lines.push(...dump.split("\n"));

      prevStack = stack;
    }

    // 終了時にすべて閉じる（セクション単位）
    for (const f of prevStack.reverse()) {
      lines.push(`;#endinclude (${path.basename(f)})`);
    }
  }

  fs.writeFileSync(lstPath, lines.join("\n") + "\n", "utf-8");
}

/**
 * 現在のposから親方向にファイル階層をたどる
 */
type IncludeFrameInfo = {
  file: string;
  parentFile?: string;
  parentLine?: number;
};

function getIncludeStackInfo(pos: SourcePos): IncludeFrameInfo[] {
  const stack: IncludeFrameInfo[] = [];
  let p: SourcePos | undefined = pos;
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
function getStackDiff(prev: string[], next: string[]) {
  let i = 0;
  while (i < prev.length && i < next.length && prev[i] === next[i]) i++;
  return {
    exited: prev.slice(i),
    entered: next.slice(i),
  };
}

function writeDumpLine(addr: number, bytes: number[], text?: string): string {
  const addrStr = addr.toString(16).padStart(4, "0").toUpperCase();
  if (!bytes || bytes.length === 0) {
    const emptyBytes = "".padEnd(9, " ");
    return `${addrStr}  ${emptyBytes}       ${text ?? ""}`.trimEnd();
  }
  const hex = bytes.map(b => b.toString(16).padStart(2, "0").toUpperCase());
  const lines: string[] = [];
  for (let i = 0; i < hex.length; i += 4) {
    const chunk = hex.slice(i, i + 4).join(" ");
    const chunkStr = chunk.padEnd(9, " ");
    if (i === 0) {
      lines.push(`${addrStr}  ${chunkStr}       ${text ?? ""}`.trimEnd());
    } else {
      lines.push(`    ${chunkStr}`.trimEnd());
    }
  }
  return lines.join("\n");
}

function formatIncludeEnter(info?: IncludeFrameInfo): string {
  if (!info) return ";#include";
  const file = path.basename(info.file);
  if (info.parentFile) {
    const parent = path.basename(info.parentFile);
    const line = (info.parentLine ?? 0) + 1;
    return `;#include "${file}" (from ${parent} line ${line})`;
  }
  return `;#include "${file}"`;
}

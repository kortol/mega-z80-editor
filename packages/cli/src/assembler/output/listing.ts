import * as fs from "fs";
import path from "path";
import { AsmContext, SourcePos } from "../context";

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
  const texts = [...ctx.texts].sort((a, b) => a.addr - b.addr);

  let prevStack: string[] = [];

  for (const t of texts) {
    const stack = getIncludeStack(t.pos);
    const diff = getStackDiff(prevStack, stack);

    // include 開始（深くなった分だけ）
    for (const f of diff.entered) {
      lines.push(`;#include <${path.basename(f)}>`);
    }

    // include 終了（浅くなった分だけ）
    for (const f of diff.exited.reverse()) {
      lines.push(`;#endinclude (${path.basename(f)})`);
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
    lines.push(`;#endinclude (${path.basename(f)})`);
  }

  fs.writeFileSync(lstPath, lines.join("\n") + "\n", "utf-8");
}

/**
 * 現在のposから親方向にファイル階層をたどる
 */
function getIncludeStack(pos: SourcePos): string[] {
  const stack: string[] = [];
  let p: SourcePos | undefined = pos;
  while (p) {
    stack.unshift(p.file);
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

/**
 * posから短いソース位置情報を返す（例: "LD A,3"）
 * 現状はpos.lineを無視しても問題ない（構文トレース専用）
 */
function getSourceSummary(pos: SourcePos): string {
  const f = path.basename(pos.file);
  return `INCLUDE "${f}"`; // 仮に今は簡易表示、必要ならctx.sourceMap参照で本来の行を表示
}
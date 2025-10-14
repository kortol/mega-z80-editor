// src/assembler/codegen/emit.ts
import { AsmContext, SectionState } from "../context";

/**
 * Codegen/Emit API
 * ---------------------------------------------------------
 * Assemblerが実際に「バイト列を出力」「Fixupを登録」「セクションを切替」する際に使用。
 * handleDB, handleDW, encodeLD などは全てこの層を通す。
 */

/* ---------------------------------------------------------
 * 🧩 初期化: デフォルトTEXTセクションを常に作成
 * -------------------------------------------------------*/
export function initCodegen(ctx: AsmContext, options?: { withDefaultSections?: boolean }) {
  ctx.texts = [];
  ctx.unresolved = [];
  ctx.errors = [];
  ctx.warnings = [];
  ctx.externs = ctx.externs ?? new Set();

  ctx.sections = new Map();
  ctx.currentSection = 0;
  ctx.loc = 0;

  if (options?.withDefaultSections !== false) {
    const textSec: SectionState = {
      id: 0,
      name: ".text",
      kind: "TEXT",
      align: 1,
      flags: 0,
      lc: 0,
      size: 0,
      bytes: [],
    };
    ctx.sections.set(0, textSec);
  }
}

/* ---------------------------------------------------------
 * 🧩 基本出力: バイト列を書き込む
 * -------------------------------------------------------*/
export function emitBytes(ctx: AsmContext, data: number[], line?: number) {
  const sec = ctx.sections.get(ctx.currentSection);
  if (!sec) throw new Error(`emitBytes: invalid section (id=${ctx.currentSection})`);

  const addr = sec.lc;
  sec.bytes.push(...data);
  sec.lc += data.length;
  sec.size = Math.max(sec.size, sec.lc);

  ctx.texts.push({ addr, data, line, sectionId: ctx.currentSection });
  ctx.loc = sec.lc;
}

/* ---------------------------------------------------------
 * 🧩 16bit即値を出力（小端）
 * -------------------------------------------------------*/
export function emitWord(ctx: AsmContext, value: number, line?: number) {
  const lo = value & 0xff;
  const hi = (value >> 8) & 0xff;
  emitBytes(ctx, [lo, hi], line);
}

/* ---------------------------------------------------------
 * 🧩 未解決シンボルをFixupとして登録（Relocatable参照）
 * -------------------------------------------------------*/
export function emitFixup(ctx: AsmContext, symbol: string, size: 1 | 2 | 4 = 2, addend = 0, line?: number) {
  const sec = ctx.sections.get(ctx.currentSection);
  console.log(ctx);

  if (!sec) throw new Error(`emitFixup: invalid section`);
  const addr = sec.lc;

  // 仮バイト列（0埋め）
  emitBytes(ctx, new Array(size).fill(0x00), line);

  ctx.unresolved.push({
    addr,
    symbol,
    size,
    addend,
  });
}

/* ---------------------------------------------------------
 * 🧩 セクション切替（存在しなければ新規作成）
 * -------------------------------------------------------*/
export function emitSection(
  ctx: AsmContext,
  name: string,
  attrs?: { align?: number }
) {
  const upper = name.toUpperCase();
  const kind =
    upper.includes("TEXT") ? "TEXT" :
      upper.includes("DATA") ? "DATA" :
        upper.includes("BSS") ? "BSS" : "CUSTOM";

  // 現在のセクションを保存
  const prev = ctx.sections.get(ctx.currentSection);
  if (prev) {
    prev.lc = ctx.loc;
    prev.size = Math.max(prev.size, prev.lc);
  }

  // 既存セクション検索
  let sec = Array.from(ctx.sections.values()).find(
    (s) =>
      s.name.replace(/^\./, "").toLowerCase() ===
      name.replace(/^\./, "").toLowerCase()
  );

  if (!sec) {
    sec = {
      id: ctx.sections.size,
      name: name.startsWith(".") ? name : `.${name.toLowerCase()}`,
      kind,
      align: attrs?.align ?? 1,
      flags: 0,
      lc: 0,
      size: 0,
      bytes: [],
    };
    ctx.sections.set(sec.id, sec);
  }

  ctx.currentSection = sec.id;
  ctx.loc = sec.lc;

  if (ctx.options?.verbose)
    console.log(`Switched to section ${sec.name} (id=${sec.id}) at loc=${ctx.loc}`);
}

/* ---------------------------------------------------------
 * 🧩 ゼロ埋め（ALIGN, DS対応）
 * -------------------------------------------------------*/
export function emitGap(ctx: AsmContext, count: number, line?: number) {
  if (count <= 0) return;
  emitBytes(ctx, new Array(count).fill(0x00), line);
}

/* ---------------------------------------------------------
 * 🧩 ALIGN制御: LCを境界に揃える
 * -------------------------------------------------------*/
export function emitAlign(ctx: AsmContext, align: number) {
  if (align <= 0 || (align & (align - 1)) !== 0)
    throw new Error(`ALIGN must be power of two`);

  const sec = ctx.sections.get(ctx.currentSection);
  if (!sec) throw new Error(`emitAlign: invalid section`);
  const mask = align - 1;
  if (sec.lc & mask) {
    const pad = align - (sec.lc & mask);
    emitGap(ctx, pad);
  }
}

/* ---------------------------------------------------------
 * 🧩 LCの取得／設定（ORG/内部制御向け）
 * -------------------------------------------------------*/
export function getLC(ctx: AsmContext): number {
  const sec = ctx.sections.get(ctx.currentSection);
  return sec ? sec.lc : ctx.loc;
}

export function setLC(ctx: AsmContext, newLC: number) {
  const sec = ctx.sections.get(ctx.currentSection);
  if (sec) {
    sec.lc = newLC;
    sec.size = Math.max(sec.size, sec.lc);
  }
  ctx.loc = newLC;
}

/* ---------------------------------------------------------
 * 🧩 DS命令（定義済み領域確保＋ゼロ埋め）
 * -------------------------------------------------------*/
export function emitStorage(ctx: AsmContext, count: number) {
  emitGap(ctx, count);
}

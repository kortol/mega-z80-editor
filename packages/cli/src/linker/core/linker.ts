// src/linker/core/linker.ts
import { parseRelFile } from "./parser";
import { RelModule, LinkResult } from "./types";
import { evalLinkExpr } from "../expr/evalLinkExpr";      // ★ 追加
import { LinkResolveContext, ResolveFn } from "../expr/types"; // ★ 追加

export function linkModules(mods: RelModule[]): LinkResult {
  const symbols = new Map<string, { bank: number; addr: number }>();
  const texts: { addr: number; bytes: number[] }[] = [];
  const refs: { addr: number; sym: string }[] = [];
  let entry: number | undefined;
  const sectionBase = new Map<string, number>();
  const singleSectionByMod = new Map<number, string | undefined>();
  const sectionKey = (modIndex: number, section?: string) => `${modIndex}::${section ?? ""}`;
  const normalizeSection = (section?: string) => (section ?? "CSEG").toUpperCase();
  const isAbsoluteSection = (section?: string) => normalizeSection(section) === "ASEG";

  // Section-based placement pass (CSEG/DSEG/COMMON/ASEG).
  let cursor = 0;
  mods.forEach((mod, modIndex) => {
    const grouped = new Map<string, { min: number; max: number }>();
    for (const t of mod.texts) {
      const sec = t.section ?? "CSEG";
      const g = grouped.get(sec) ?? { min: Number.MAX_SAFE_INTEGER, max: -1 };
      g.min = Math.min(g.min, t.addr);
      g.max = Math.max(g.max, t.addr + t.bytes.length - 1);
      grouped.set(sec, g);
    }
    singleSectionByMod.set(modIndex, grouped.size === 1 ? Array.from(grouped.keys())[0] : undefined);

    for (const [sec, range] of grouped.entries()) {
      if (range.max < 0) {
        sectionBase.set(sectionKey(modIndex, sec), 0);
        continue;
      }
      if (isAbsoluteSection(sec) || range.min > 0) {
        sectionBase.set(sectionKey(modIndex, sec), 0);
        cursor = Math.max(cursor, range.max + 1);
      } else {
        const base = cursor;
        sectionBase.set(sectionKey(modIndex, sec), base);
        cursor = Math.max(cursor, base + range.max + 1);
      }
    }
  });

  // パス1: シンボル収集
  mods.forEach((mod, modIndex) => {
    for (const s of mod.symbols) {
      const sec = s.section ?? singleSectionByMod.get(modIndex);
      const base = sectionBase.get(sectionKey(modIndex, sec)) ?? 0;
      const resolvedAddr = s.addr + base;
      if (symbols.has(s.name)) {
        const existing = symbols.get(s.name)!;
        // EXTERN仮定義 → 上書きOK
        if (existing.addr === 0) {
          symbols.set(s.name, { bank: 0, addr: resolvedAddr });
          continue;
        }
        // 同一値の重複定義は許容（複数モジュールで共通定数を定義するケース）
        if (existing.addr === resolvedAddr) {
          continue;
        }
        throw new Error(`Duplicate symbol '${s.name}'`);
      }
      symbols.set(s.name, { bank: 0, addr: resolvedAddr });
    }


    texts.push(...mod.texts.map((t) => {
      const base = sectionBase.get(sectionKey(modIndex, t.section ?? singleSectionByMod.get(modIndex))) ?? 0;
      return { addr: t.addr + base, bytes: t.bytes };
    }));
    refs.push(...mod.refs.map((r) => {
      const base = sectionBase.get(sectionKey(modIndex, r.section ?? singleSectionByMod.get(modIndex))) ?? 0;
      return { addr: r.addr + base, sym: r.sym };
    }));

    if (mod.entry !== undefined && entry === undefined) {
      const base = sectionBase.get(sectionKey(modIndex, singleSectionByMod.get(modIndex))) ?? 0;
      entry = mod.entry + base;
    }

    // extern宣言の登録
    for (const x of mod.externs) {
      if (!symbols.has(x)) {
        symbols.set(x, { bank: 0, addr: 0 }); // 仮定義
      }
    }
  });

  // ★ リゾルブコンテキスト生成
  const ctx: LinkResolveContext = {
    symbols,
    externs: new Set(mods.flatMap(m => m.externs)),
  };

  // ★ resolver関数
  const resolver: ResolveFn = (name, context = ctx) => {
    if (context.symbols.has(name)) {
      return { kind: "defined", addr: context.symbols.get(name)!.addr };
    } else if (context.externs?.has(name)) {
      return { kind: "extern" };
    } else {
      return { kind: "unknown" };
    }
  };

  // パス2: メモリ配置
  const mem = new Uint8Array(0x10000);
  let minUsed = 0xffff;
  let maxUsed = 0;

  for (const t of texts) {
    for (let i = 0; i < t.bytes.length; i++) {
      const addr = t.addr + i;
      mem[addr] = t.bytes[i];
      minUsed = Math.min(minUsed, addr);
      maxUsed = Math.max(maxUsed, addr);
    }
  }

  // ★ Rレコード適用（evalLinkExpr使用）
  for (const r of refs) {
    const res = evalLinkExpr(r.sym, resolver, { wrap16: true }, ctx);

    if (res.ok) {
      const v = res.value! & 0xFFFF;
      mem[r.addr] = v & 0xFF;
      mem[r.addr + 1] = (v >> 8) & 0xFF;
    } else {
      // 未解決またはエラー → 0埋め
      mem[r.addr] = 0;
      mem[r.addr + 1] = 0;
      if (res.unresolved) {
        console.warn(
          `⚠️ Unresolved symbol(s): ${res.unresolved.join(", ")} at ${r.addr.toString(16)}h`
        );
      }
      if (res.errors) {
        console.warn(`⚠️ Eval error: ${res.errors.join("; ")} (at ${r.addr.toString(16)}h)`);
      }
    }
  }

  return {
    segments: [
      {
        bank: 0,
        kind: "text",
        range: { min: minUsed, max: maxUsed },
        data: mem.slice(minUsed, maxUsed + 1),
      },
    ],
    entry,
    symbols,
  };
}

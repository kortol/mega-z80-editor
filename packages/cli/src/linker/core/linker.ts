// src/linker/core/linker.ts
import { parseRelFile } from "./parser";
import { RelModule, LinkResult } from "./types";

function splitSymAddend(s: string): { name: string; addend: number } {
  const m = s.match(/^([A-Z_][A-Z0-9_]*)([+\-]\d+)?$/i);
  if (!m) return { name: s, addend: 0 };
  const name = m[1];
  const addend = m[2] ? parseInt(m[2], 10) : 0; // P1-C では ±1 / ±-1 程度でOK
  return { name, addend };
}

export function linkModules(mods: RelModule[]): LinkResult {
  const symbols = new Map<string, { bank: number; addr: number }>();
  const texts: { addr: number; bytes: number[] }[] = [];
  const refs: { addr: number; sym: string }[] = [];
  let entry: number | undefined;

  // パス1: シンボル収集
  for (const mod of mods) {

    for (const s of mod.symbols) {
      if (symbols.has(s.name)) {
        throw new Error(`Duplicate symbol '${s.name}'`);
      }
      symbols.set(s.name, { bank: 0, addr: s.addr });
    }

    texts.push(...mod.texts);
    refs.push(...mod.refs);

    if (mod.entry !== undefined && entry === undefined) {
      entry = mod.entry;
    }

    // パス1のシンボル収集直後に追加
    for (const x of mod.externs) {
      if (!symbols.has(x)) {
        symbols.set(x, { bank: 0, addr: 0 }); // 仮の0埋め
      }
    }
  }


  // パス2: メモリ配置
  const mem = new Uint8Array(0x10000);
  let minUsed = 0xffff;
  let maxUsed = 0;

  for (const t of texts) {
    for (let i = 0; i < t.bytes.length; i++) {
      const addr = t.addr + i;
      if (mem[addr] !== 0) throw new Error(`Overlap at ${addr.toString(16)}`);
      mem[addr] = t.bytes[i];
      minUsed = Math.min(minUsed, addr);
      maxUsed = Math.max(maxUsed, addr);
    }
  }

  // R レコード適用
  for (const r of refs) {
    const { name, addend } = splitSymAddend(r.sym);
    if (!symbols.has(name)) throw new Error(`Undefined symbol '${name}'`);
    const val = symbols.get(name)!; // {addr: number}
    const v = (val.addr + addend) & 0xFFFF;

    // 既存仕様に合わせて常に16bit書き込み（DBでも2B書く簡易仕様）
    mem[r.addr] = v & 0xFF;
    mem[r.addr + 1] = (v >> 8) & 0xFF;
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

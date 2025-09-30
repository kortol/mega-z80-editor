// src/linker/core/linker.ts
import { parseRelFile } from "./parser";
import { RelModule, LinkResult } from "./types";

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
    if (!symbols.has(r.sym)) throw new Error(`Undefined symbol '${r.sym}'`);
    const val = symbols.get(r.sym)!;
    mem[r.addr] = val.addr & 0xff;
    mem[r.addr + 1] = (val.addr >> 8) & 0xff;
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

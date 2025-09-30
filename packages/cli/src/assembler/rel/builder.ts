// src/assembler/rel/builder.ts
import { AsmContext } from "../context";
import { RelFile, RelRecord } from "./types";

export class RelBuilder {
  private file: RelFile;

  constructor(moduleName: string) {
    this.file = { module: moduleName, records: [], unresolved: [] };
    this.file.records.push({ kind: "H", name: moduleName });
  }

  addText(addr: number, bytes: number[]) {
    this.file.records.push({ kind: "T", addr, bytes });
  }

  addSymbol(name: string, addr: number) {
    this.file.records.push({ kind: "S", name, addr });
  }

  addReloc(addr: number, sym: string, addend: number = 0) {
    this.file.records.push({ kind: "R", addr, sym, addend });
  }

  setEntry(addr: number) {
    this.file.records.push({ kind: "E", addr });
  }

  // ★ 未解決シンボルを追加する
  addUnresolved(addr: number, symbol: string) {
    this.file.unresolved.push({ addr, symbol });
    this.file.records.push({ kind: "R", addr, sym: symbol, addend: 0 }); // ← 追加
  }

  build(): RelFile {
    return this.file;
  }
}

export function buildRelFile(ctx: AsmContext): RelFile {
  const records: RelRecord[] = [];

  // H
  records.push({ kind: "H", name: ctx.moduleName });

  // T
  for (const t of ctx.texts) {
    records.push({ kind: "T", addr: t.addr, bytes: t.data });
  }

  // S
  for (const [sym, addr] of ctx.symbols.entries()) {
    records.push({ kind: "S", name: sym, addr });
  }

  // R
  for (const r of ctx.unresolved) {
    records.push({ kind: "R", addr: r.addr, sym: r.symbol });
  }

  // E
  if (ctx.entry !== undefined) {
    records.push({ kind: "E", addr: ctx.entry });
  }

  return {
    module: ctx.moduleName,
    records,
    unresolved: ctx.unresolved,
  };
}

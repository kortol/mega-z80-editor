// packages\cli\src\assembler\rel\builder.ts
import { AsmContext } from "../context";
import { RelFile, RelRecord } from "./types";
import { writeRelV2 } from "./writerV2";

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
    this.file.records.push({ kind: "R", size: 2, addr, sym, addend });
  }

  setEntry(addr: number) {
    this.file.records.push({ kind: "E", addr });
  }

  // ★ 未解決シンボルを追加する
  addUnresolved(addr: number, symbol: string) {
    this.file.unresolved.push({ addr, symbol });
    this.file.records.push({ kind: "R", addr, size: 2, sym: symbol, addend: 0 }); // ← 追加
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
    records.push({ kind: "R", addr: r.addr, sym: r.symbol, size: r.size, addend: r.addend });
  }

  // X
  for (const ext of ctx.externs) {
    records.push({ kind: "X", name: ext });
  }

  // E
  if (ctx.entry !== undefined) {
    records.push({ kind: "E", addr: ctx.entry });
  } else if (ctx.texts.length > 0) {
    // END未指定なら補完する
    if (ctx.symbols.has("START")) {
      ctx.entry = ctx.symbols.get("START") as number;
    } else if (ctx.loc !== undefined) {
      ctx.entry = ctx.loc;
    }
  }

  if (ctx.entry !== undefined) {
    records.push({ kind: "E", addr: ctx.entry });
  }


  return {
    module: ctx.moduleName,
    records,
    unresolved: ctx.unresolved,
  };
}

export function emitRelV2(ctx: AsmContext, outPath: string) {
  const mod = buildModuleV2(ctx);
  const header = {
    magic: "MZ8R" as const,
    version: 2 as const,
    flags: 0,
    sectionCount: mod.sections.length,
    strTabSize: 0,
    symCount: 0,
    fixupCount: 0,
    dataSize: mod.sections.reduce((a, s) => a + s.data.length, 0),
    entrySymIndex: -1,
  };
  const relV2 = {
    header,
    sections: mod.sections,
    symbols: [],
    fixups: [],
    data: Buffer.concat(mod.sections.map(s => Buffer.from(s.data))),
    strtab: new Uint8Array(),
    entrySymIndex: -1,
  };
  writeRelV2(relV2, outPath);
  ctx.output.relPath = outPath;
  ctx.output.relSize = relV2.data.length;
  ctx.output.relVersion = 2;
  ctx.output.generatedAt = new Date();
}

export function buildModuleV2(ctx: AsmContext) {
  const sections = Array.from(ctx.sections.values()).map(s => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    align: s.align,
    size: s.size,
    flags: s.flags,
    data: Uint8Array.from(s.bytes)
  }));
  return { sections };
}
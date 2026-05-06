import { AsmContext } from "../context";
import { SourceMapEntry, SourceMapFile, normalizeMapPath } from "../../sourcemap/model";

export function buildAssemblerSourceMap(ctx: AsmContext, inputFile: string, outputFile: string): SourceMapFile {
  const sectionNameById = new Map<number, string>();
  for (const sec of ctx.sections.values()) {
    sectionNameById.set(sec.id, sec.name);
  }

  const entries: SourceMapEntry[] = [];
  const listing = ctx.listing ?? [];
  for (const l of listing) {
    const size = l.bytes?.length ?? 0;
    if (size <= 0) continue;
    if (!l.pos?.file) continue;
    entries.push({
      addr: l.addr & 0xffff,
      size,
      file: normalizeMapPath(l.pos.file),
      line: Math.max(1, (l.pos.line ?? 0) + 1),
      column: l.pos.column != null ? Math.max(1, l.pos.column + 1) : undefined,
      module: ctx.moduleName,
      section: sectionNameById.get(l.sectionId ?? ctx.currentSection),
    });
  }

  return {
    version: 1,
    kind: "as",
    module: ctx.moduleName,
    output: normalizeMapPath(outputFile),
    entries,
  };
}


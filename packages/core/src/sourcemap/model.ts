import * as fs from "fs";

export type SourceMapEntry = {
  addr: number;
  size: number;
  file: string;
  line: number; // 1-based
  column?: number; // 1-based
  module?: string;
  section?: string;
};

export type SourceMapFile = {
  version: 1;
  kind: "as" | "link";
  module?: string;
  output?: string;
  entries: SourceMapEntry[];
};

export function normalizeMapPath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function readSourceMap(filePath: string): SourceMapFile | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<SourceMapFile>;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
  const entries: SourceMapEntry[] = [];
  for (const e of parsed.entries) {
    if (!e) continue;
    const addr = (Number(e.addr) | 0) & 0xffff;
    const size = Math.max(1, Number(e.size) | 0);
    const file = typeof e.file === "string" ? normalizeMapPath(e.file) : "";
    const line = Number(e.line) | 0;
    if (!file || line <= 0) continue;
    const column = e.column != null ? Math.max(1, Number(e.column) | 0) : undefined;
    const module = typeof e.module === "string" ? e.module : undefined;
    const section = typeof e.section === "string" ? e.section : undefined;
    entries.push({ addr, size, file, line, column, module, section });
  }
  return {
    version: 1,
    kind: parsed.kind === "link" ? "link" : "as",
    module: typeof parsed.module === "string" ? parsed.module : undefined,
    output: typeof parsed.output === "string" ? parsed.output : undefined,
    entries,
  };
}

export function writeSourceMap(filePath: string, map: SourceMapFile): void {
  const normalized: SourceMapFile = {
    ...map,
    version: 1,
    entries: map.entries.map((e) => ({
      ...e,
      addr: e.addr & 0xffff,
      size: Math.max(1, e.size | 0),
      file: normalizeMapPath(e.file),
      line: Math.max(1, e.line | 0),
      column: e.column != null ? Math.max(1, e.column | 0) : undefined,
    })),
  };
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
}

export function buildAddrToSource(entries: SourceMapEntry[]): Map<number, SourceMapEntry> {
  const map = new Map<number, SourceMapEntry>();
  for (const e of entries) {
    for (let i = 0; i < e.size; i++) {
      const addr = (e.addr + i) & 0xffff;
      if (!map.has(addr)) map.set(addr, e);
    }
  }
  return map;
}


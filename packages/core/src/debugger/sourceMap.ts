import { SourceMapEntry, buildAddrToSource, readSourceMap } from "../sourcemap/model";

export function parseDbgSourceMap(smapPath: string): SourceMapEntry[] {
  const sm = readSourceMap(smapPath);
  return sm?.entries ?? [];
}

export function buildAddrToSourceEntry(entries: SourceMapEntry[]): Map<number, SourceMapEntry> {
  return buildAddrToSource(entries);
}


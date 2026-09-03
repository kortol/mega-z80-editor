import * as fs from "fs";

export type SymEntry = { name: string; addr: number };

export function parseSymFile(symPath: string): SymEntry[] {
  if (!fs.existsSync(symPath)) return [];
  const lines = fs.readFileSync(symPath, "utf-8").split(/\r?\n/);
  const out: SymEntry[] = [];
  for (const line of lines) {
    const m = line.match(/^([@A-Za-z0-9_.$?]+)\s+([0-9A-F]{1,8})H\b/i);
    if (!m) continue;
    out.push({ name: m[1], addr: Number.parseInt(m[2], 16) });
  }
  return out;
}

export function buildAddrToNames(entries: SymEntry[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const e of entries) {
    const names = map.get(e.addr) ?? [];
    names.push(e.name);
    map.set(e.addr, names);
  }
  return map;
}


// src/linker/core/parser.ts
import * as fs from "fs";
import { RelModule } from "./types";

export function parseRelFile(filename: string): RelModule {
  const buf = fs.readFileSync(filename);
  // v2 begins with binary magic "MZ8R" + version byte, then text body.
  const isV2 = buf.length >= 5
    && buf[0] === 0x4d // M
    && buf[1] === 0x5a // Z
    && buf[2] === 0x38 // 8
    && buf[3] === 0x52 // R
    && buf[4] === 0x02;

  const text = isV2 ? buf.subarray(5).toString("utf8") : buf.toString("utf8");

  const lines = text
    .split(/\r?\n/)
    .map(l => l.replace(/;.*/, "").trim())
    .filter(Boolean);

  const mod: RelModule = { name: "", symbols: [], texts: [], refs: [], externs: [], };
  const sections = new Map<number, string>();
  let currentTextSection: string | undefined;

  // 各行をパース
  for (const line of lines) {
    if (line.startsWith("$SECTION")) {
      // $SECTION <id> <name> ...
      const m = line.match(/^\$SECTION\s+(\d+)\s+([^\s]+)/i);
      if (m) {
        sections.set(Number(m[1]), m[2]);
      }
      continue;
    }
    if (line.startsWith("$TEXT")) {
      // $TEXT section=<name>
      const m = line.match(/section=([^\s]+)/i);
      currentTextSection = m?.[1];
      continue;
    }

    const [rec, ...rest] = line.split(/\s+/);
    switch (rec) {
      case "H":
        mod.name = rest[0];
        break;
      case "T": {
        const base = parseInt(rest[0], 16);
        const bytes = rest.slice(1).map(x => parseInt(x, 16));
        mod.texts.push({ addr: base, bytes, section: currentTextSection });
        break;
      }
      case "S":
        mod.symbols.push({
          name: rest[0],
          addr: parseInt(rest[1], 16),
          section: rest[2],
        });
        break;
      case "R":
        mod.refs.push({
          addr: parseInt(rest[0], 16),
          sym: rest[1],
          section: rest[2],
        });
        break;
      case "X":
        // rest[0] がシンボル名
        const extName = rest[0];
        if (extName) mod.externs.push(extName);
        break;
      case "E":
        mod.entry = parseInt(rest[0], 16);
        break;
      default:
        throw new Error(`Unknown record '${rec}' in ${filename}`);
    }
  }

  // v2 fallback: when section tags are not repeated on symbols/refs, use single section if possible.
  if (sections.size === 1) {
    const only = Array.from(sections.values())[0];
    for (const s of mod.symbols) if (!s.section) s.section = only;
    for (const r of mod.refs) if (!r.section) r.section = only;
    for (const t of mod.texts) if (!t.section) t.section = only;
  }

  return mod;
}

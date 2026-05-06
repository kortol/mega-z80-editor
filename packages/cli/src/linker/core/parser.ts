// src/linker/core/parser.ts
import * as fs from "fs";
import { RelModule, RelSectionInfo } from "./types";

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

  const mod: RelModule = { name: "", symbols: [], texts: [], refs: [], externs: [], version: isV2 ? 2 : 1, sections: [] };
  const sections = new Map<number, RelSectionInfo>();
  let currentTextSection: string | undefined;

  // 各行をパース
  for (const line of lines) {
    if (line.startsWith("$SECTION")) {
      // $SECTION <id> <name> kind=TEXT size=... align=... org=...
      const m = line.match(/^\$SECTION\s+(\d+)\s+([^\s]+)\s*(.*)$/i);
      if (m) {
        const id = Number(m[1]);
        const name = m[2];
        const rest = m[3] ?? "";
        const info: RelSectionInfo = { id, name };
        for (const token of rest.split(/\s+/).filter(Boolean)) {
          const [keyRaw, valueRaw] = token.split("=");
          if (!valueRaw) continue;
          const key = keyRaw.toLowerCase();
          if (key === "kind") {
            info.kind = valueRaw.toUpperCase() as RelSectionInfo["kind"];
          } else if (key === "align") {
            const v = parseNum(valueRaw);
            if (v !== null) info.align = v;
          } else if (key === "size") {
            const v = parseNum(valueRaw);
            if (v !== null) info.size = v;
          } else if (key === "org") {
            const v = parseNum(valueRaw);
            if (v !== null) info.org = v;
          }
        }
        sections.set(id, info);
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
        mod.name = decodeToken(rest[0] ?? "");
        break;
      case "T": {
        const base = parseInt(rest[0], 16);
        const bytes = rest.slice(1).map(x => parseInt(x, 16));
        mod.texts.push({ addr: base, bytes, section: currentTextSection });
        break;
      }
      case "S": {
        const name = rest[0];
        const addr = parseInt(rest[1], 16);
        let section: string | undefined;
        let storage: "ABS" | "REL" | "EXT" | undefined;
        let moduleName: string | undefined;
        let defFile: string | undefined;
        let defLine: number | undefined;
        let metaStart = 4;
        if (rest[2]) {
          const t2 = rest[2].toUpperCase();
          if (t2 === "ABS" || t2 === "REL" || t2 === "EXT") {
            storage = t2 as any;
            metaStart = 3;
          } else {
            section = rest[2];
          }
        }
        if (rest[3]) {
          const t3 = rest[3].toUpperCase();
          if (t3 === "ABS" || t3 === "REL" || t3 === "EXT") {
            storage = t3 as any;
            metaStart = 4;
          } else if (rest[3].includes("=")) {
            metaStart = 3;
          }
        }
        for (const token of rest.slice(metaStart)) {
          const eq = token.indexOf("=");
          if (eq <= 0) continue;
          const key = token.slice(0, eq);
          const rawValue = token.slice(eq + 1);
          if (key === "module") {
            moduleName = decodeToken(rawValue);
          } else if (key === "defFile") {
            defFile = decodeToken(rawValue);
          } else if (key === "defLine") {
            const v = Number(rawValue);
            if (Number.isFinite(v)) defLine = Math.trunc(v);
          }
        }

        mod.symbols.push({
          name,
          addr,
          section,
          storage,
          module: moduleName ?? mod.name,
          defFile,
          defLine,
        });
        break;
      }
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
  mod.sections = Array.from(sections.values());
  if (sections.size === 1) {
    const only = Array.from(sections.values())[0].name;
    for (const s of mod.symbols) if (!s.section) s.section = only;
    for (const r of mod.refs) if (!r.section) r.section = only;
    for (const t of mod.texts) if (!t.section) t.section = only;
  }

  return mod;
}

function parseNum(token: string): number | null {
  const t = token.trim().toUpperCase();
  if (/^[0-9A-F]+H$/.test(t)) return parseInt(t.slice(0, -1), 16);
  if (/^0X[0-9A-F]+$/.test(t)) return parseInt(t.slice(2), 16);
  if (/^[+\-]?\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

function decodeToken(token: string): string {
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
}

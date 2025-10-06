// src/linker/core/parser.ts
import * as fs from "fs";
import { RelModule } from "./types";

export function parseRelFile(filename: string): RelModule {
  const lines = fs.readFileSync(filename, "utf8")
    .split(/\r?\n/)
    .map(l => l.replace(/;.*/, "").trim())
    .filter(Boolean);

  const mod: RelModule = { name: "", symbols: [], texts: [], refs: [], externs: [], };

  for (const line of lines) {
    const [rec, ...rest] = line.split(/\s+/);
    switch (rec) {
      case "H":
        mod.name = rest[0];
        break;
      case "T": {
        const base = parseInt(rest[0], 16);
        const bytes = rest.slice(1).map(x => parseInt(x, 16));
        mod.texts.push({ addr: base, bytes });
        break;
      }
      case "S":
        mod.symbols.push({ name: rest[0], addr: parseInt(rest[1], 16) });
        break;
      case "R":
        mod.refs.push({ addr: parseInt(rest[0], 16), sym: rest[1] });
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
  return mod;
}

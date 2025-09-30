// src/assembler/rel/adapter.ts
import { RelAdapter } from "./types";
import { RelFile } from "./types";

function hex4(n: number) {
  return n.toString(16).padStart(4, "0").toUpperCase();
}
function hex2(n: number) {
  return n.toString(16).padStart(2, "0").toUpperCase();
}

export class TextRelAdapter implements RelAdapter {
  write(file: RelFile): string {
    return file.records.map(r => {
      switch (r.kind) {
        case "H": return `H ${r.name}`;
        case "T": return `T ${hex4(r.addr)} ${r.bytes.map(hex2).join(" ")}`;
        case "S": return `S ${r.name} ${hex4(r.addr)}`;
        case "R": return `R ${hex4(r.addr)} ${r.sym}${r.addend ? ` ${r.addend}` : ""}`;
        case "E": return `E ${hex4(r.addr)}`;
      }
    }).join("\n");
  }
}

export class JsonRelAdapter implements RelAdapter {
  write(file: RelFile): string {
    return JSON.stringify(file, null, 2);
  }
}

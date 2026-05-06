import fs from "fs";
import path from "path";
import { RelModuleV2 } from "./types";

/**
 * `.rel v2` writer
 */

/**
 * RelV2 writer (multi-section aware)
 * -----------------------------------------------------
 * 出力フォーマット:
 *   MZ8R (magic)
 *   version 2
 *   $SECTION <id> <name> size=<size> align=<align>
 *   T <addr> <bytes...>  ; per section
 *   S <name> <addr>
 *   E <entry>
 */
export function writeRelV2(mod: RelModuleV2, outPath: string) {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fd = fs.openSync(outPath, "w");
  const w = (s: string) => fs.writeSync(fd, s + "\n");

  // --- Header ---
  fs.writeSync(fd, Buffer.from("MZ8R"));
  fs.writeSync(fd, Buffer.from([2])); // version = 2
  w(""); // 改行で区切り（次から通常出力）

  if (mod.moduleName) {
    w(`H ${encodeToken(mod.moduleName)}`);
  }

  // --- Section table ---
  for (const sec of mod.sections) {
    const parts = [
      `$SECTION ${sec.id} ${sec.name}`,
      `kind=${sec.kind ?? "TEXT"}`,
      `size=${sec.size ?? 0}`,
      `align=${sec.align ?? 1}`,
    ];
    if (sec.org !== undefined) {
      const orgHex = sec.org.toString(16).toUpperCase();
      parts.push(`org=${orgHex}H`);
    }
    w(parts.join(" "));
  }

  // --- Text records grouped by section ---
  for (const sec of mod.sections) {
    const texts = mod.texts.filter((t) => t.sectionId === sec.id);
    if (texts.length === 0) continue;

    w(`$TEXT section=${sec.name}`);
    for (const t of texts) {
      const addrHex = t.addr.toString(16).padStart(4, "0").toUpperCase();
      const bytesHex = t.data
        .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
        .join(" ");
      w(`T ${addrHex} ${bytesHex}`);
    }
  }

  // --- Symbols ---
  for (const sym of mod.symbols) {
    if (sym.storage === "EXT") {
      w(`X ${sym.name}`); // 外部参照
      continue;
    }

    const addrHex = sym.value.toString(16).padStart(4, "0").toUpperCase();
    const secName =
      sym.sectionId != null && mod.sections[sym.sectionId]
        ? ` ${mod.sections[sym.sectionId].name}`
        : "";
    const storage = sym.storage ?? "REL";
    const extras: string[] = [];
    if (sym.moduleName) extras.push(`module=${encodeToken(sym.moduleName)}`);
    if (sym.defFile) extras.push(`defFile=${encodeToken(sym.defFile)}`);
    if (typeof sym.defLine === "number" && Number.isFinite(sym.defLine)) {
      extras.push(`defLine=${Math.trunc(sym.defLine)}`);
    }
    w(`S ${sym.name} ${addrHex}${secName} ${storage}${extras.length ? ` ${extras.join(" ")}` : ""}`);
  }

  // --- Relocations / unresolved refs ---
  for (const fx of mod.fixups ?? []) {
    const sym = mod.symbols[fx.symIndex];
    if (!sym) continue;
    const offHex = fx.offset.toString(16).padStart(4, "0").toUpperCase();
    const expr =
      fx.addend && fx.addend !== 0
        ? `${sym.name}${fx.addend > 0 ? `+${fx.addend}` : `${fx.addend}`}`
        : sym.name;
    const secName =
      fx.sectionId != null && mod.sections[fx.sectionId]
        ? ` ${mod.sections[fx.sectionId].name}`
        : "";
    w(`R ${offHex} ${expr}${secName}`);
  }

  // --- Entry point ---
  if (mod.entry !== undefined) {
    const entryHex = mod.entry.toString(16).padStart(4, "0").toUpperCase();
    w(`E ${entryHex}`);
  }

  fs.closeSync(fd);
}

function encodeToken(value: string): string {
  return encodeURIComponent(value);
}

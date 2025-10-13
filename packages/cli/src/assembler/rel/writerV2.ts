import fs from "fs";
import { RelModuleV2 } from "./types";

function writeU8(arr: number[], val: number) { arr.push(val & 0xff); }
function writeU16(arr: number[], val: number) { arr.push(val & 0xff, (val >> 8) & 0xff); }
function writeU32(arr: number[], val: number) {
  arr.push(val & 0xff, (val >> 8) & 0xff, (val >> 16) & 0xff, (val >> 24) & 0xff);
}
function writeStrZ(arr: number[], s: string) {
  for (const c of s) arr.push(c.charCodeAt(0));
  arr.push(0);
}

/**
 * `.rel v2` writer
 */
export function writeRelV2(module: RelModuleV2, outPath: string) {
  const buf: number[] = [];

  // ---- Header ----
  writeStrZ(buf, "MZ8R"); // magic
  writeU8(buf, 2);        // version
  writeU8(buf, 0);        // flags
  writeU16(buf, module.sections.length);
  writeU32(buf, module.strtab.length);
  writeU32(buf, module.symbols.length);
  writeU32(buf, module.fixups.length);
  writeU32(buf, module.data.length);
  writeU32(buf, module.entrySymIndex ?? -1);

  // ---- Section Table ----
  for (const s of module.sections) {
    writeU16(buf, s.id);
    writeU16(buf, ["TEXT","DATA","BSS","CUSTOM"].indexOf(s.kind));
    writeU16(buf, s.align);
    writeU16(buf, s.flags);
    writeU32(buf, s.size);
    writeU32(buf, s.dataOffset ?? 0);
    writeU32(buf, s.nameStrOff ?? 0);
  }

  // ---- Symbol Table ----
  for (const sym of module.symbols) {
    writeU32(buf, sym.nameStrOff ?? 0);
    writeU8(buf, ["ABS","REL","EXT"].indexOf(sym.storage));
    writeU8(buf, sym.sectionId ?? 0xff);
    writeU16(buf, 0);
    writeU32(buf, sym.value);
  }

  // ---- Fixup Table ----
  for (const f of module.fixups) {
    writeU16(buf, f.sectionId);
    writeU32(buf, f.offset);
    writeU8(buf, f.width);
    let flags = 0;
    if (f.signed) flags |= 1;
    if (f.pcrel) flags |= 2;
    writeU8(buf, flags);
    writeU8(buf, 0); // expr tag reserved
    writeU32(buf, f.symIndex);
    writeU32(buf, f.addend);
  }

  // ---- Data ----
  buf.push(...module.data);

  // ---- StrTab ----
  buf.push(...module.strtab);

  fs.writeFileSync(outPath, Buffer.from(buf));
}

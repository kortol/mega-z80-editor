// src/assembler/rel/types.ts

// ================================================================
// 🧩 v1 Relocation Format (single-section)
// ================================================================

export type RelRecord =
  | { kind: "H"; name: string }
  | { kind: "T"; addr: number; bytes: number[] }
  | { kind: "S"; name: string; addr: number }
  | { kind: "R"; addr: number; sym: string; size: number; addend?: number }
  | { kind: "X"; name: string }
  | { kind: "E"; addr: number };

export interface RelFile {
  module: string;
  records: RelRecord[];
  unresolved: { addr: number; symbol: string }[];
}

export interface RelAdapter {
  write(file: RelFile): string | Buffer;
}

// ================================================================
// 🧩 v2 Relocation Format (multi-section)
// ================================================================

export interface RelHeaderV2 {
  magic: "MZ8R";
  version: 2;
  flags: number;
  sectionCount: number;
  strTabSize: number;
  symCount: number;
  fixupCount: number;
  dataSize: number;
  entrySymIndex: number;
}

export interface RelSectionDescV2 {
  id: number;
  kind: "TEXT" | "DATA" | "BSS" | "CUSTOM";
  name: string;
  align: number;
  flags: number;      // bitflags (RO/RW/EXEC/ALLOC/LOAD)
  size: number;
  dataOffset: number; // DataBlob内オフセット
  nameStrOff: number; // StrTab参照
}

export interface RelSymbolV2 {
  name: string;
  storage: "ABS" | "REL" | "EXT";
  sectionId: number | null;
  value: number;
  nameStrOff: number;
}

export interface RelFixupV2 {
  sectionId: number;
  offset: number;
  width: 1 | 2;
  signed: boolean;
  pcrel: boolean;
  symIndex: number;
  addend: number;
}

export interface RelModuleV2 {
  header: RelHeaderV2;
  sections: RelSectionDescV2[];
  symbols: RelSymbolV2[];
  fixups: RelFixupV2[];
  data: Uint8Array;
  strtab: Uint8Array;
}

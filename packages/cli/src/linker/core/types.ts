// src/linker/core/types.ts
export interface RelSymbol { name: string; addr: number; }
export interface RelText { addr: number; bytes: number[]; }
export interface RelRef { addr: number; sym: string; }

export interface RelModule {
  name: string;
  symbols: RelSymbol[];
  texts: RelText[];
  refs: RelRef[];
  externs: string[];
  entry?: number;
}

export type SegmentKind = "text" | "data" | "bss" | "custom";

export interface MemorySegment {
  bank: number;
  kind: SegmentKind;
  range: {
    min: number;// 使用開始アドレス
    max: number;// 使用終了アドレス
  };
  data?: Uint8Array;   // bss の場合は undefined
}

export interface LinkResult {
  segments: MemorySegment[];
  entry?: number;       // エントリポイント
  symbols: Map<string, { bank: number; addr: number }>;
}

// ================================================================
// 🧩 Multi-section Linker Model (v2準備)
// ================================================================

export interface ModuleSection {
  id: number;
  kind: "TEXT" | "DATA" | "BSS" | "CUSTOM";
  name: string;
  align: number;
  flags: number;
  size: number;
  base?: number;      // 配置後
  data?: Uint8Array;  // TEXT/DATAのみ
}

export interface MultiSectionModule {
  sections: ModuleSection[];
  symbols: {
    name: string;
    storage: "ABS" | "REL" | "EXT";
    sectionId: number | null;
    value: number;
  }[];
  fixups: {
    sectionId: number;
    offset: number;
    width: number;
    signed: boolean;
    pcrel: boolean;
    symIndex: number;
    addend: number;
  }[];
  dataBlob?: Uint8Array;
  entrySymIndex?: number;
}

export interface MemorySegmentRule {
  match: {
    kind?: "TEXT" | "DATA" | "BSS" | "CUSTOM";
    name?: string | RegExp;
  };
  org?: number;
  after?: string;
  align?: number;
  order?: number;
  flags?: {
    ro?: boolean;
    rw?: boolean;
    exec?: boolean;
    load?: boolean;
    alloc?: boolean;
  };
  note?: string;
  source?: "cli" | "script" | "default";
}

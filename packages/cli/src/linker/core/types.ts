// src/linker/core/types.ts
export interface RelSymbol { name: string; addr: number; }
export interface RelText { addr: number; bytes: number[]; }
export interface RelRef { addr: number; sym: string; }

export interface RelModule {
  name: string;
  symbols: RelSymbol[];
  texts: RelText[];
  refs: RelRef[];
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

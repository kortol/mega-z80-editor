// src/assembler/rel/types.ts
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

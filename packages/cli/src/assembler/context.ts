export interface UnresolvedEntry {
  addr: number;        // アドレス
  symbol: string;      // 未解決シンボル名
  size: number;        // バイト数 (1 or 2)
  relative?: boolean;  // JR/DJNZ など相対ジャンプなら true
}

export interface AsmText {
  addr: number;
  data: number[];
}

export interface AsmContext {
  loc: number; // 現在アドレス
  moduleName: string;
  symbols: Map<string, number>;
  unresolved: UnresolvedEntry[];
  modeWord32: boolean;
  modeSymLen: number;
  caseInsensitive: boolean;
  texts: AsmText[];
  endReached?: boolean; // ← END 疑似命令に到達したか
  warnings?: string[];
  maxSymbolLen?: number;
}

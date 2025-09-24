export interface AsmContext {
  loc: number;   // 現在アドレス
  moduleName: string; 
  symbols: Map<string, number>;
  unresolved: { addr: number; symbol: string; size: number }[];
  modeWord32: boolean;
  modeSymLen: number;
  caseInsensitive: boolean;
  texts: { addr: number; data: number[] }[];
  endReached?: boolean; // ← END 疑似命令に到達したか
}

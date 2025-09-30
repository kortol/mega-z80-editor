// エラーコードをまとめた列挙型
export enum AssemblerErrorCode {
  // 汎用
  Unknown = "A0000",

  // Expr 系
  ExprOverflow = "A2001", // 幅外れ (下位ビット採用)
  ExprUndefinedSymbol = "A2100", // 未定義シンボル
  ExprExternArithmetic = "A2101", // EXT ± EXT
  ExprConstMinusExtern = "A2102", // const - EXT
  ExprCircularRef = "A2103", // シンボルの循環参照
  ExprDivideByZero = "A2200", // ゼロ除算/剰余ゼロ
  ExprNaN = "A2201", // 演算結果がNaN/Infinity

  // Parser 系
  UnexpectedToken = "A3000",
  UnterminatedString = "A3001",
  InvalidEquSyntax = "A3002",
  ExprExternInEnd = "A3101",

  // Encoder 系
  InvalidOperand = "A4000",
  RangeError = "A4001",

  // Linker 系
  UnresolvedExtern = "A5000",
}

// エラー情報の型
export interface AssemblerError {
  code: AssemblerErrorCode;
  message: string;
  line?: number;
  column?: number;
  symbol?: string;
}

// メッセージを組み立てるヘルパー
export function makeError(
  code: AssemblerErrorCode,
  message: string,
  opts: Partial<AssemblerError> = {}
): AssemblerError {
  return { code, message, ...opts };
}

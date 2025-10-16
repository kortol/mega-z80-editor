import { SourceFrame } from "./context";

// エラーコードをまとめた列挙型
export enum AssemblerErrorCode {
  // 汎用
  Unknown = "A0000",

  IncludeSyntaxError = "A1001",
  IncludeNotFound = "A1002",
  IncludeLoop = "A1003",

  // Expr 系
  ExprOverflow = "A2001", // 幅外れ (下位ビット採用)
  ExprUndefinedSymbol = "A2100", // 未定義シンボル
  ExprExternArithmetic = "A2101", // EXT ± EXT
  ExprConstMinusExtern = "A2102", // const - EXT
  ExprCircularRef = "A2103", // シンボルの循環参照
  ExprNotConstant = "A2104", // 定数ではない
  ExprDivideByZero = "A2200", // ゼロ除算/剰余ゼロ
  ExprNaN = "A2201", // 演算結果がNaN/Infinity

  // Parser 系
  UnexpectedToken = "A3000",
  UnterminatedString = "A3001",
  InvalidEquSyntax = "A3002",
  ExprExternInEnd = "A3101",
  RedefSymbol = "A3102",  // シンボルの再定義
  SyntaxError = "A3103",

  // Encoder 系
  InvalidOperand = "A4000",
  RangeError = "A4001",
  ExternMissingSymbol = "A4002",   // ★ 新規
  MissingOperand = "A4003",


  // Linker 系
  UnresolvedExtern = "A5000",

  // Section 系
  OrgBackward = "A6000",    // ORGが後退

  // Branch 系
  OutOfRange8 = "A8000",
  OutOfRangeRel = "A8001",
}

// エラー情報の型
export interface AssemblerError {
  code: AssemblerErrorCode;
  message: string;
  line?: number;
  column?: number;
  symbol?: string;
  file?: string;
  /** INCLUDE / MACRO 呼び出しなどのスタック情報 */
  frame?: SourceFrame;
  /** ネストした呼び出しトレース（INCLUDEスタックなど） */
  trace?: SourceFrame[];
}

// メッセージを組み立てるヘルパー
export function makeError(
  code: AssemblerErrorCode,
  message: string,
  opts: Partial<AssemblerError> = {}
): AssemblerError {
  return { code, message, ...opts };
}

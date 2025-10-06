import { AssemblerErrorCode } from "../errors";

// 演算子定義
export type UnaryOp = "+" | "-";
export type BinaryOp = "+" | "-" | "*" | "/" | "%";

// 式ノード
export type Expr =
  | { kind: "Const"; value: number }
  | { kind: "Symbol"; name: string }
  | { kind: "Unary"; op: UnaryOp; expr: Expr }
  | { kind: "Binary"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "Paren"; expr: Expr };

// 評価結果
export type EvalResult =
  | { kind: "Const"; value: number }
  | { kind: "Reloc"; sym: string; addend: number }
  | { kind: "Error"; code: AssemblerErrorCode };

import { AssemblerErrorCode } from "../errors";
export type UnaryOp = "+" | "-" | "~" | "!";
export type BinaryOp = "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "<" | "<=" | ">" | ">=" | "==" | "!=" | "&" | "^" | "|";
export type Expr = {
    kind: "Const";
    value: number;
} | {
    kind: "Symbol";
    name: string;
} | {
    kind: "Unary";
    op: UnaryOp;
    expr: Expr;
} | {
    kind: "Binary";
    op: BinaryOp;
    left: Expr;
    right: Expr;
} | {
    kind: "Paren";
    expr: Expr;
};
export type EvalResult = {
    kind: "Const";
    value: number;
} | {
    kind: "Reloc";
    sym: string;
    addend: number;
} | {
    kind: "Error";
    code: AssemblerErrorCode;
};

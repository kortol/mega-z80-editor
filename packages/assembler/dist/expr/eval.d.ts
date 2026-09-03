import { EvalResult, Expr } from "./types";
import { AsmContext, SymbolEntry } from "../context";
export interface EvalContext {
    symbols: Map<string, Expr | SymbolEntry | number>;
    externs: Set<string>;
    pass: 1 | 2;
    errors: any[];
    visiting: Set<string>;
    loc: number;
    currentGlobalLabel?: string;
    caseInsensitive?: boolean;
}
export declare function makeEvalCtx(ac: AsmContext): EvalContext;
export declare function evalConst(expr: any, ctx: AsmContext): number;
export declare function evalExpr(expr: Expr, ctx: EvalContext): EvalResult;

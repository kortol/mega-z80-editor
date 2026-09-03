import { LinkResolveContext, ResolveFn, EvalResult, EvalOptions } from "./types";
/**
 * P1-F: リンク時式評価 (flat + / - sequence of symbols and constants)
 *
 * 入力例:
 *   "1234"
 *   "FOO"
 *   "BAR+2"
 *   "EXTSYM-4"
 *   "FOO+BAR-4"
 *
 * 出力:
 *   { ok:true, value: number } または { ok:false, unresolved: [...] }
 */
export declare function evalLinkExpr(expr: string, resolve: ResolveFn, options?: EvalOptions, ctx?: LinkResolveContext): EvalResult;

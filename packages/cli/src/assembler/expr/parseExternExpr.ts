import { tokenize } from "../tokenizer";
import { parseExpr } from "./parserExpr";
import { evalExpr } from "./eval";
import { AsmContext } from "../context";
import { EvalContext } from "./eval";

/**
 * 外部シンボル参照をパースし、Reloc可能かを返す。
 * extern名 + 定数 の形式を許可。
 */
export function parseExternExpr(ctx: AsmContext, expr: string) {
  const tokens = tokenize(ctx, expr).filter(t => t.kind !== "eol");
  const e = parseExpr(tokens);

  // EvalContextをAssembleContextから派生
  const evalCtx: EvalContext = {
    symbols: ctx.symbols,
    externs: ctx.externs,
    pass: 1,
    errors: ctx.errors,
    visiting: new Set(),
    loc: ctx.loc,
    currentGlobalLabel: ctx.currentGlobalLabel,
    caseInsensitive: ctx.caseInsensitive,
  };

  const res = evalExpr(e, evalCtx);

  if (res.kind === "Reloc") {
    return {
      symbol: res.sym,
      addend: res.addend,
    };
  }
  return null;
}

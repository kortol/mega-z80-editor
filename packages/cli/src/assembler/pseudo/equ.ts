import { AsmContext } from "../context";
import { NodePseudo } from "../parser";
import { parseNumber } from "../tokenizer";

export function handleEQU(ctx: AsmContext, node: NodePseudo) {
  let [sym, valStr] = node.args;

  if (ctx.caseInsensitive) {
    sym = sym.toUpperCase();
  }

  // SYMLENチェック
  if (sym.length > ctx.modeSymLen) {
    const truncated = sym.substring(0, ctx.modeSymLen);
    ctx.warnings = ctx.warnings ?? [];
    ctx.warnings.push(`Symbol ${sym} truncated to ${truncated}`);
    sym = truncated;
  }

  const val = parseNumber(valStr);

  if (ctx.symbols.has(sym)) {
    const prev = ctx.symbols.get(sym);

    // ✅ pass2 かつ 同じ値なら再定義を許可
    if (ctx.pass === 2 && prev === val) {
      return;
    }
    throw new Error(`Symbol ${sym} redefined`);
  }

  // ✅ CONST登録（単純な数値）
  ctx.symbols.set(sym, val);
}

export function handleSYMLEN(ctx: AsmContext, node: NodePseudo) {
  ctx.modeSymLen = parseInt(node.args[0], 10);
}

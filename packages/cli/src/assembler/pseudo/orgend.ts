import { AsmContext } from "../context";
import { NodePseudo } from "../parser";
import { parseNumber } from "../tokenizer";

export function handleORG(ctx: AsmContext, node: NodePseudo) {
  const val = parseNumber(node.args[0]);
  if (val < 0 || val > 0xFFFF) throw new Error(`ORG out of range: ${val}`);
  ctx.loc = val;
}

export function handleEND(ctx: AsmContext) {
  ctx.endReached = true;
}

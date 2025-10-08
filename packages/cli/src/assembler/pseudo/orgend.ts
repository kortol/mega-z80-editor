import { AsmContext } from "../context";
import { NodePseudo } from "../parser";
import { resolveExpr16 } from "../encoder/utils";

export function handleORG(ctx: AsmContext, node: NodePseudo) {
  if (node.args.length !== 1) {
    throw new Error(`ORG requires exactly one argument at line ${node.line}`);
  }
  const val = resolveExpr16(ctx, node.args[0], node.line, true, true);

  // 未定義シンボルはエラーにする（ORGは relocatable じゃないので）
  if (val === null) {
    throw new Error(`ORG with unresolved symbol '${node.args[0]}' at line ${node.line}`);
  }

  ctx.loc = val;
}

export function handleEND(ctx: AsmContext, node: NodePseudo) {
  ctx.endReached = true;
}

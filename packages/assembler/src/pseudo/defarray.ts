import { AsmContext, canon } from "../context";
import { NodePseudo } from "../node";

export function handleDEFARRAY(ctx: AsmContext, node: NodePseudo): void {
  const first = node.args?.[0];
  const key = (first?.key ?? first?.value ?? "").trim();
  if (!key) return;
  const values = (node.args ?? []).slice(1).map((arg) => String(arg?.value ?? "").trim());
  ctx.sjasmArrays ??= new Map<string, string[]>();
  ctx.sjasmArrays.set(canon(key, ctx), values);
}

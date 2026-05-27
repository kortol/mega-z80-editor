import { canon, defineSymbol } from "../context";
import { parseExpr } from "../expr/parserExpr";
import { evalExpr, makeEvalCtx } from "../expr/eval";
import { NodePseudo } from "../node";
import { tokenize } from "../tokenizer";

export function handleDEFINE(ctx: any, node: NodePseudo): void {
  const first = node.args?.[0];
  const second = node.args?.[1];
  const key = (first?.key ?? first?.value ?? "").trim();
  const raw = first?.key ? (first?.value ?? "") : (second?.value ?? "");
  if (!key) return;

  const text = raw.trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    ctx.stringDefines ??= new Map<string, string>();
    ctx.stringDefines.set(canon(key, ctx), text);
    defineSymbol(ctx, key, 0, "CONST", node.pos);
    return;
  }

  const tokens = tokenize(ctx, text).filter((t) => t.kind !== "eol");
  if (tokens.length === 0) {
    defineSymbol(ctx, key, 0, "CONST", node.pos);
    return;
  }

  const expr = parseExpr(tokens);
  const result = evalExpr(expr, makeEvalCtx(ctx));
  if (result.kind === "Const") {
    defineSymbol(ctx, key, result.value, "CONST", node.pos);
    return;
  }

  defineSymbol(ctx, key, 0, "CONST", node.pos);
}

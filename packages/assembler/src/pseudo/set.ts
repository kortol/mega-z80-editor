import { AsmContext } from "../context";
import { AssemblerErrorCode, makeError } from "../errors";
import { evalExpr, makeEvalCtx } from "../expr/eval";
import { parseExpr } from "../expr/parserExpr";
import { NodePseudo } from "../node";
import { tokenize } from "../tokenizer";

export function handleSET(ctx: AsmContext, node: NodePseudo) {
  if (ctx.phase !== "analyze") return;
  if (node.args.length !== 1) {
    ctx.errors.push(
      makeError(
        AssemblerErrorCode.SyntaxError,
        `SET requires two arguments at line ${node.pos.line}`,
        { pos: node.pos }
      )
    );
    return;
  }

  const key = node.args[0].key ?? "";
  const valStr = node.args[0].value ?? "";
  if (!key) {
    ctx.errors.push(
      makeError(
        AssemblerErrorCode.SyntaxError,
        `SET missing symbol name at line ${node.pos.line}`,
        { pos: node.pos }
      )
    );
    return;
  }

  const sym = ctx.caseInsensitive ? key.toUpperCase() : key;
  const cleaned = valStr.replace(/,/g, " ");
  const tokens = tokenize(ctx, cleaned).filter((t) => t.kind !== "eol");
  const e = parseExpr(tokens);
  const evalCtx = makeEvalCtx(ctx);
  const res = evalExpr(e, evalCtx);
  if (res.kind !== "Const") {
    ctx.errors.push(
      makeError(
        AssemblerErrorCode.ExprNotConstant,
        `SET value must be constant at line ${node.pos.line}`,
        { pos: node.pos }
      )
    );
    return;
  }

  ctx.symbols.set(sym, {
    value: res.value,
    sectionId: ctx.currentSection ?? 0,
    type: "CONST",
    pos: node.pos,
  });
}

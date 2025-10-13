import { AsmContext } from "../context";
import { parseExpr } from "../expr/parserExpr";
import { evalExpr, makeEvalCtx } from "../expr/eval";
import { Node } from "../parser";
import { AssemblerErrorCode, makeError } from "../errors";
import { Token, tokenize } from "../tokenizer";

export function handleEND(ctx: AsmContext, node: Node) {
  if (node.kind !== "pseudo" || node.op !== "END") return;

  // ENDに到達
  ctx.endReached = true;

  if (node.args.length === 0) {
    // END (引数なし) → entry未定義
    ctx.entry = undefined;
    return;
  }

  // END expr
  // ★ EOL を除去してから parseExpr
  const tokens: Token[] = tokenize(node.args.join(" ")).filter(
    (t) => t.kind !== "eol"
  );
  const expr = parseExpr(tokens);
  const evalCtx = makeEvalCtx(ctx);
  const res = evalExpr(expr, evalCtx);

  if (res.kind === "Const") {
    ctx.entry = res.value;
  } else if (res.kind === "Reloc") {
    // evalExpr が A2100 を積んでいる可能性を消す
    ctx.errors = ctx.errors.filter(
      (e) => e.code !== AssemblerErrorCode.ExprUndefinedSymbol
    );
    // 外部シンボルはエントリ不可
    ctx.errors.push(
      makeError(
        AssemblerErrorCode.ExprExternInEnd,
        `External symbol not allowed in END: ${node.args.join(" ")}`
      )
    );
    ctx.entry = undefined;
  }
}

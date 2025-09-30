import { AsmContext } from "../context";
import { AssemblerErrorCode } from "../errors";
import { NodePseudo } from "../parser";

export function handleEXTERN(ctx: AsmContext, node: NodePseudo) {
  // 形式: EXTERN <symbol> [FROM "libfile"]
  const [sym, fromKw, file] = node.args;

  if (!sym) {
    ctx.errors.push({
      code: AssemblerErrorCode.ExternMissingSymbol,
      message: "EXTERN requires a symbol",
      line: node.line,
    });
    return;
  }

  // シンボルは未解決リストに登録（アドレス不定）
  ctx.unresolved.push({
    addr: ctx.loc,
    symbol: sym,
    size: 2, // デフォルト16bit参照扱い
  });

  // FROM "libfile" は今は無視
  if (fromKw?.toUpperCase() === "FROM") {
    // 将来ライブラリ対応時に処理する
  }
}

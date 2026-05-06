// src/assembler/pseudo/extern.ts
import { AsmContext } from "../context";
import { AssemblerErrorCode } from "../errors";
import { NodePseudo } from "../node";

export function handleEXTERN(ctx: AsmContext, node: NodePseudo) {
  const [sym, fromKw, file] = node.args;
  if (!sym || !sym.value) {
    ctx.errors.push({
      code: AssemblerErrorCode.ExternMissingSymbol,
      message: "EXTERN requires a symbol",
      pos: node.pos,
    });
    return;
  }
  // 参照は作らない。宣言だけ
  ctx.externs.add(sym?.value.toUpperCase());

  // FROM "libfile" は今は無視
  if (fromKw?.value.toUpperCase() === "FROM") {
    // 将来ライブラリ対応時に処理する
  }
}

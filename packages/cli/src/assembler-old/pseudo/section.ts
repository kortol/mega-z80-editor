// src/assembler/pseudo/section.ts
import { AsmContext } from "../context";
import { NodePseudo } from "../parser";
import { emitSection } from "../codegen/emit";

/**
 * SECTION 擬似命令
 *   SECTION TEXT
 *   SECTION DATA
 *   SECTION BSS
 *   SECTION .custom
 */
export function handleSECTION(ctx: AsmContext, node: NodePseudo | string, attrs?: { align?: number }) {
  // nodeが文字列で渡された場合もサポート（テストや内部呼び出し用）
  const name = typeof node === "string" ? node : node.args?.[0]?.value ?? "TEXT";

  // emitSection に責務を委譲
  emitSection(ctx, name, attrs);

  if (ctx.options?.verbose) {
    const sec = ctx.sections.get(ctx.currentSection);
    console.log(`Switched to section ${sec?.name} (id=${sec?.id}) at loc=${ctx.loc}`);
  }
}

import { AsmContext } from "../context";
import { NodePseudo } from "../parser";
import { resolveExpr16 } from "../encoder/utils";
import { AssemblerErrorCode, makeError } from "../errors";  // 既存makeErrorを利用

export function handleORG(ctx: AsmContext, node: NodePseudo) {
  if (node.args.length !== 1) {
    throw new Error(`ORG requires exactly one argument at line ${node.line}`);
  }

  const arg = node.args[0];
  const inValue = arg.value;
  const val = resolveExpr16(ctx, inValue, node.line, true, true);

  // 未定義シンボルはエラーにする（ORGは relocatable じゃないので）
  if (val === null) {
    throw new Error(`ORG with unresolved symbol '${inValue}' at line ${node.line}`);
  }

  // --- 🩹 フォールバック: sections未定義なら旧動作 ---
  if (!ctx.sections || !ctx.sections.size) {
    ctx.loc = val;
    return;
  }

  const sec = ctx.sections.get(ctx.currentSection)!;

  // LC逆行禁止チェック
  if (val < sec.lc) {
    ctx.errors.push(
      makeError(AssemblerErrorCode.OrgBackward, `ORG moved backward in section ${sec.name} (line ${node.line})`)
    );
    return;
  }

  // セクションのLC更新
  sec.lc = val;

  // 現在位置同期
  ctx.loc = val; // ← 古いAPIとの互換性維持（既存命令エンコーダが使っているため）
}

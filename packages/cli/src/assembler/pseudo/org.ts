import { AsmContext } from "../context";
import { NodePseudo } from "../node";
import { resolveExpr16 } from "../encoder/utils";
import { AssemblerErrorCode } from "../errors";

export function handleORG(ctx: AsmContext, node: NodePseudo) {
  if (node.args.length !== 1) {
    throw new Error(`ORG requires exactly one argument at line ${node.pos.line}`);
  }

  const arg = node.args[0];
  const inValue = arg.value;
  const val = resolveExpr16(ctx, inValue, node.pos, true, true);

  // 未定義シンボルはエラーにする（ORGは relocatable じゃないので）
  if (val === null) {
    throw new Error(`ORG with unresolved symbol '${inValue}' at line ${node.pos.line}`);
  }

  // --- 🩹 フォールバック: sections未定義なら旧動作 ---
  if (!ctx.sections || !ctx.sections.size) {
    ctx.loc = val;
    return;
  }

  const sec = ctx.sections.get(ctx.currentSection)!;
  const useRel = (ctx.output?.relVersion ?? ctx.options?.relVersion ?? 1) === 2;
  const isAseg = sec.kind === "ASEG";

  // M80互換: ORG の前進・後退を許可（現在セクションのLoCを直接設定）
  if (val < 0 || val > 0xffff) {
    ctx.errors.push({
      code: AssemblerErrorCode.OrgBackward,
      message: `ORG out of range in section ${sec.name} (line ${node.pos.line})`,
      pos: node.pos,
    });
    return;
  }

  if (useRel && !isAseg) {
    // 初回 ORG はセクションの基点 (org) を定義する
    if (!sec.orgDefined) {
      sec.org = val;
      sec.orgDefined = true;
    }
    if (val < (sec.org ?? 0)) {
      ctx.errors.push({
        code: AssemblerErrorCode.OrgBackward,
        message: `ORG before section base ${sec.org?.toString(16)}H in ${sec.name} (line ${node.pos.line})`,
        pos: node.pos,
      });
      return;
    }
  }

  if (isAseg) {
    // ASEG は絶対配置: org は使わず LC のみ更新
    sec.org = 0;
    sec.orgDefined = true;
  }

  // セクションのLC更新
  sec.lc = val;

  // 現在位置同期
  ctx.loc = val; // ← 古いAPIとの互換性維持（既存命令エンコーダが使っているため）
}

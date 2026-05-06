import { AssemblerErrorCode, makeWarning } from "../errors";
import { AsmContext, canon, SourcePos } from "../context";
import { Token } from "../tokenizer";
import type { MacroParam } from "../node";
import path from "path";

export function defineMacro(
  name: string,
  params: MacroParam[],
  bodyTokens: Token[],
  ctx: AsmContext,
  defPos: SourcePos,
  isLocal = false,
) {
  const key = canon(name, ctx);

  // 🟩 ローカルマクロの場合は現在スコープのトップに登録
  let targetTable: Map<string, any> | undefined;
  if (isLocal) {
    const top = ctx.macroTableStack.at(-1);
    if (!top) {
      ctx.errors.push({
        code: AssemblerErrorCode.SyntaxError,
        message: `LOCALMACRO '${name}' defined outside of any MACRO scope.`,
        pos: defPos,
      });
      return;
    }
    targetTable = top;
  } else {
    targetTable = ctx.macroTable;
  }

  ctx.seenMacroSites ??= new Set<string>();
  const fileKey = defPos.file ? path.resolve(defPos.file) : "(nofile)";
  const site = `${fileKey}:${defPos.line}:${key}`;
  if (ctx.seenMacroSites.has(site)) {
    return; // 同一サイトからの重複（フェーズ跨ぎ含む）は無視
  }

  // --- すでに登録済みならスキップ（同一位置は二重登録とみなさない） ---
  const existing = targetTable.get(key);

  if (existing) {
    // 同じ定義位置なら単なる再解析なので無視
    if (
      existing.pos.file === defPos.file &&
      existing.pos.line === defPos.line
    ) {
      ctx.seenMacroSites.add(site);
      return;
    }

    // 異なる位置なら「再定義」として通常エラー
    ctx.errors.push({
      code: AssemblerErrorCode.MacroRedefined,
      message: `Macro '${name}' already defined`,
      pos: defPos,
    });
    return;
  }

  // --- 命令名衝突チェック ---
  if (!isLocal && ctx.opcodes.has(key)) {
    if (ctx.options.strictMacro) {
      ctx.errors.push({
        code: AssemblerErrorCode.MacroNameReserved,
        message: `Cannot redefine instruction '${name}' as a macro.`,
        pos: defPos,
      });
      return; // 定義しない
    } else {
      ctx.warnings.push(
        makeWarning(
          AssemblerErrorCode.MacroOverridesInstr,
          `Macro '${name}' overrides Z80 instruction.`,
          { pos: defPos },
        )
      );
    }
  }

  targetTable.set(key, { 
    kind:"macroDef" , 
    name,
    params,
    bodyTokens, 
    pos: defPos, 
    startPos: defPos,  // 仮
    endPos: defPos,  // 仮
    isLocal 
  });
}

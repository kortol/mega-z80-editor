import { AssemblerErrorCode, makeWarning } from "../errors";
import { AsmContext, canon, SourcePos } from "../context";
import { Token } from "../tokenizer";

export function defineMacro(name: string, params: string[], bodyTokens: Token[], ctx: AsmContext, defPos: SourcePos) {
  const key = canon(name, ctx);

  // --- すでに登録済みならスキップ（同一位置は二重登録とみなさない） ---
  const existing = ctx.macroTable.get(key);
  if (existing) {
    // 同じ定義位置なら単なる再解析なので無視
    if (
      existing.defPos.file === defPos.file &&
      existing.defPos.line === defPos.line
    ) {
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

  // 命令と衝突
  if (ctx.opcodes.has(key)) {
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

  ctx.macroTable.set(key, { name, params, bodyTokens, defPos });
}

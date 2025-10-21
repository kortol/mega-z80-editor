// src/assembler/analyze.ts
import { AsmContext, defineSymbol } from "./context";
import { handlePseudo } from "./pseudo";
import { estimateInstrSize } from "./encoder";
import { AssemblerErrorCode, makeError } from "./errors";

export function runAnalyze(ctx: AsmContext) {
  ctx.loc = 0;
  ctx.relocs = []; // ✅ 追加: Reloc情報を毎回初期化

  for (const node of ctx.nodes ?? []) {
    switch (node.kind) {
      // // --- 🧩 マクロ定義登録 (P2-E-02) ---
      // case "macroDef": {
      //   const name = ctx.caseInsensitive
      //     ? node.name.toUpperCase()
      //     : node.name;

      //   if (ctx.macroTable.has(name)) {
      //     ctx.errors.push(
      //       makeError(
      //         AssemblerErrorCode.MacroRedefined,
      //         `Macro '${name}' already defined`,
      //         { pos: node.pos }
      //       )
      //     );
      //     break;
      //   }

      //   ctx.macroTable.set(name, {
      //     name,
      //     params: node.params ?? [],
      //     bodyTokens: node.bodyTokens,
      //     defPos: node.pos,
      //   });

      //   if (ctx.verbose) ctx.logger?.info?.(`Registered macro: ${name}`);
      //   break;
      // }
      // --- 🧩 マクロ定義は macroExpand フェーズで処理する ---
      case "macroDef":
        // ここでは登録せずスキップ
        break;

      // --- 既存処理 ---
      case "label":
        defineSymbol(ctx, node.name, ctx.loc, "LABEL");
        break;

      case "pseudo":
        handlePseudo(ctx, node);
        break;

      case "instr":
        ctx.loc += estimateInstrSize(ctx, node);
        break;
    }
  }
}

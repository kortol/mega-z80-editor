// src/assembler/analyze.ts
import { AsmContext, defineSymbol } from "./context";
import { handlePseudo } from "./pseudo";
import { handleConditional, isConditionActive, isConditionalOp } from "./pseudo/conditional";
import { estimateInstrSize } from "./encoder";
import { AssemblerErrorCode, makeError } from "./errors";
import { setPhase } from "./phaseManager";

export function runAnalyze(ctx: AsmContext) {
  const phase = ctx.phase as any;
  if (phase !== "analyze") {
    if (phase === "tokenize") {
      setPhase(ctx, "parse");
    }
    if ((ctx.phase as any) !== "analyze") {
      setPhase(ctx, "analyze");
    }
  }
  ctx.loc = 0;
  ctx.relocs = []; // ✅ 追加: Reloc情報を毎回初期化
  ctx.condStack = [];

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
        if (!isConditionActive(ctx)) break;
        defineSymbol(ctx, node.name, ctx.loc, "LABEL", node.pos);
        break;

      case "pseudo":
        if (isConditionalOp(node.op)) {
          handleConditional(ctx, node);
          break;
        }
        if (!isConditionActive(ctx)) break;
        handlePseudo(ctx, node);
        break;

      case "instr":
        if (!isConditionActive(ctx)) break;
        ctx.loc += estimateInstrSize(ctx, node);
        break;
      case "empty":
        // 空行/コメント行は何もしない
        break;
    }
  }
}

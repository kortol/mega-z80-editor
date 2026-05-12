"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAnalyze = runAnalyze;
// src/assembler/analyze.ts
const context_1 = require("./context");
const pseudo_1 = require("./pseudo");
const conditional_1 = require("./pseudo/conditional");
const encoder_1 = require("./encoder");
const phaseManager_1 = require("./phaseManager");
function runAnalyze(ctx) {
    const phase = ctx.phase;
    if (phase !== "analyze") {
        if (phase === "tokenize") {
            (0, phaseManager_1.setPhase)(ctx, "parse");
        }
        if (ctx.phase !== "analyze") {
            (0, phaseManager_1.setPhase)(ctx, "analyze");
        }
    }
    ctx.loc = 0;
    ctx.relocs = []; // ✅ 追加: Reloc情報を毎回初期化
    ctx.condStack = [];
    for (let i = 0; i < (ctx.nodes?.length ?? 0); i++) {
        const node = ctx.nodes[i];
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
                if (!(0, conditional_1.isConditionActive)(ctx))
                    break;
                if (!node.name.startsWith(".")) {
                    ctx.currentGlobalLabel = (0, context_1.canon)(node.name, ctx);
                }
                (0, context_1.defineSymbol)(ctx, node.name, ctx.loc, "LABEL", node.pos);
                break;
            case "pseudo":
                if ((0, conditional_1.isConditionalOp)(node.op)) {
                    (0, conditional_1.handleConditional)(ctx, node);
                    break;
                }
                if (!(0, conditional_1.isConditionActive)(ctx))
                    break;
                {
                    const op = node.op.toUpperCase();
                    (0, pseudo_1.handlePseudo)(ctx, node);
                    if (op === "INCLUDE") {
                        // INCLUDE 展開で nodes が差し替わるため、同じ index から再処理
                        i--;
                    }
                }
                break;
            case "instr":
                if (!(0, conditional_1.isConditionActive)(ctx))
                    break;
                ctx.loc += (0, encoder_1.estimateInstrSize)(ctx, node);
                break;
            case "empty":
                // 空行/コメント行は何もしない
                break;
        }
    }
}

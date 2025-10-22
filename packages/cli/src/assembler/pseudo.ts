import { AsmContext, popMacroScope, pushMacroScope } from "./context";
import { NodePseudo } from "./parser";
import { handleORG } from "./pseudo/org";
import { handleEND } from "./pseudo/end";
import { handleEQU, handleSYMLEN } from "./pseudo/equ";
import { handleDB, handleDW, handleDS, handleWORD32 } from "./pseudo/data";
import { handleEXTERN } from "./pseudo/extern";
import { handleSECTION } from "./pseudo/section";
import { handleALIGN } from "./pseudo/align";
import { setPhase } from "./phaseManager";
import { expandMacros } from "./macro";
import { runAnalyze } from "./analyze";
import { AssemblerErrorCode, makeError } from "./errors";
import { handleInclude } from "./pseudo/include";

export function handlePseudo(ctx: AsmContext, node: NodePseudo): void {
  switch (node.op.toUpperCase()) {
    case "ORG":
      return handleORG(ctx, node);
    case "END":
      return handleEND(ctx, node);
    case "EQU":
      return handleEQU(ctx, node);
    case "EXTERN":
      return handleEXTERN(ctx, node);
    case ".SYMLEN":
      return handleSYMLEN(ctx, node);
    case "DB":
    case "DEFB":
      return handleDB(ctx, node);
    case "DW":
    case "DEFW":
      return handleDW(ctx, node);
    case "DS":
    case "DEFS":
      return handleDS(ctx, node); // 何もしない（領域確保は context.js の reserveBytes() で実施済み）
    case ".WORD32":
      return handleWORD32(ctx, node);
    case "SECTION": {
      const name = node.args?.[0]?.value ?? "TEXT";
      const alignArg = node.args?.find((a) => a.key?.toUpperCase() === "ALIGN");
      const align = alignArg ? Number(alignArg.value) : 1;
      handleSECTION(ctx, name, { align: align });
      break;
    }
    case "ALIGN": {
      const align = Number(node.args?.[0]?.value) || 1;
      return handleALIGN(ctx, align);
    }

    case "INCLUDE": {
      const includeArg = node.args[0];
      if (!includeArg || typeof includeArg.value !== "string") {
        ctx.errors.push(makeError(
          AssemblerErrorCode.SyntaxError,
          "INCLUDE requires string literal path",
          { pos: node.pos }
        ));
        break;
      }

      const includePath = includeArg.value;

      // --- 🧩 スコープ切り替え ---
      pushMacroScope(ctx);

      // --- 🧩 既存の include 機構を利用 ---
      const includeNode = { kind: "pseudo", op: "INCLUDE", args: node.args, pos: node.pos } as NodePseudo;
      const includedNodes = handleInclude(includeNode, ctx);

      // --- 🧩 INCLUDE内部をマクロ展開・解析 ---
      const savedNodes = ctx.nodes ?? [];
      ctx.nodes = includedNodes;

      // --- フェーズ変更は emit フェーズ以外でのみ実行 ---
      if (ctx.phase !== "emit") {
        setPhase(ctx, "macroExpand");
        expandMacros(ctx);
        setPhase(ctx, "analyze");
        runAnalyze(ctx);
      } else {
        // emit中にINCLUDEが出てきた場合は単純にファイルノード結合のみ
        ctx.logger?.debug?.("Skip macroExpand/analyze in emit phase");
      }

      // --- 🧩 スコープ戻し（promote=true で昇格） ---
      popMacroScope(ctx, true);

      // --- 🧩 ノード結合 ---
      ctx.nodes = savedNodes.concat(includedNodes);
      break;
    }

    default:
      throw new Error(`Unknown pseudo op ${node.op} at line ${node.pos.line}`);
  }
}

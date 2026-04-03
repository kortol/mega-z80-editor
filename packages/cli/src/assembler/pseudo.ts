import { AsmContext } from "./context";
import { NodePseudo } from "./node";
import { handleORG } from "./pseudo/org";
import { handleEND } from "./pseudo/end";
import { handleEQU, handleSYMLEN } from "./pseudo/equ";
import { handleDB, handleDW, handleDS, handleWORD32 } from "./pseudo/data";
import { handleEXTERN } from "./pseudo/extern";
import { handleSECTION } from "./pseudo/section";
import { handleALIGN } from "./pseudo/align";
import { setPhase } from "./phaseManager";
import { expandMacros, popMacroScope, pushMacroScope } from "./macro";
import { runAnalyze } from "./analyze";
import { AssemblerErrorCode, makeError } from "./errors";
import { handleInclude } from "./pseudo/include";
import { handleConditional, isConditionalOp } from "./pseudo/conditional";
import { handleSET } from "./pseudo/set";
import { handleDC, handleDZ } from "./pseudo/data";
import {
  handleEXITM,
  handleEXTERNALAlias,
  handleGLOBAL,
  handleLIST,
  handleLOCAL,
  handlePAGE,
  handleSectionAlias,
  handleTITLE,
} from "./pseudo/compat";

export function handlePseudo(ctx: AsmContext, node: NodePseudo): void {
  switch (node.op.toUpperCase()) {
    case "IF":
    case "ELSEIF":
    case "ELSE":
    case "ENDIF":
    case "IFIDN":
    case "IFDIF":
    case "IFDEF":
    case "IFNDEF":
    case "IFB":
    case "IFNB":
      return handleConditional(ctx, node);
    case "ORG":
      return handleORG(ctx, node);
    case "END":
      return handleEND(ctx, node);
    case "EQU":
      return handleEQU(ctx, node);
    case "EXTERN":
      return handleEXTERN(ctx, node);
    case "EXTERNAL":
    case "EXT":
      return handleEXTERNALAlias(ctx, node);
    case ".SYMLEN":
      return handleSYMLEN(ctx, node);
    case "DB":
    case "DEFB":
    case "DEFM":
      return handleDB(ctx, node);
    case "DC":
      return handleDC(ctx, node);
    case "DZ":
      return handleDZ(ctx, node);
    case "DW":
    case "DEFW":
      return handleDW(ctx, node);
    case "DS":
    case "DEFS":
      return handleDS(ctx, node); // 何もしない（領域確保は context.js の reserveBytes() で実施済み）
    case ".WORD32":
      return handleWORD32(ctx, node);
    case "SET":
      return handleSET(ctx, node);
    case "DEFL":
      return handleSET(ctx, { ...node, op: "SET" });
    case "GLOBAL":
    case "PUBLIC":
      return handleGLOBAL(ctx, node);
    case "LOCAL":
      return handleLOCAL(ctx, node);
    case "CSEG":
      return handleSectionAlias(ctx, node, "CSEG");
    case "DSEG":
      return handleSectionAlias(ctx, node, "DSEG");
    case "ASEG":
      return handleSectionAlias(ctx, node, "ASEG");
    case "COMMON":
      return handleSectionAlias(ctx, node, "COMMON");
    case "TITLE":
      return handleTITLE(ctx, node);
    case "PAGE":
      return handlePAGE(ctx, node);
    case "LIST":
      return handleLIST(ctx, node);
    case "EXITM":
      return handleEXITM(ctx, node);
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
      if ((node as any).__included) {
        break;
      }
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

      // --- 🧩 セクション復帰用に現在セクション名を保存 ---
      const currentSectionName =
        ctx.sections.get(ctx.currentSection)?.name ?? ".text";
      ctx.sectionStack.push(currentSectionName);

      // --- 🧩 スコープ切り替え ---
      pushMacroScope(ctx);

      // --- 🧩 既存の include 機構を利用 ---
      const includeNode = { kind: "pseudo", op: "INCLUDE", args: node.args, pos: node.pos } as NodePseudo;
      const includedNodes = handleInclude(ctx, includeNode, true);

      // --- 🧩 INCLUDE内部をマクロ展開 ---
      const savedNodes = ctx.nodes ?? [];
      ctx.nodes = includedNodes;

      if (ctx.phase !== "emit") {
        setPhase(ctx, "macroExpand");
        expandMacros(ctx);
        setPhase(ctx, "analyze");
      }

      // --- 🧩 スコープ戻し（promote=true で昇格） ---
      popMacroScope(ctx);

      (node as any).__included = true;

      // --- 🧩 INCLUDE終端でセクションを復帰 ---
      const restoreName = ctx.sectionStack.pop() ?? currentSectionName;
      const restoreNode: NodePseudo = {
        kind: "pseudo",
        op: "SECTION",
        args: [{ value: restoreName }],
        pos: node.pos,
      };
      includedNodes.push(restoreNode);

      // --- 🧩 ノード結合（INCLUDE位置に差し込み） ---
      const insertAt = savedNodes.indexOf(node);
      if (insertAt >= 0) {
        const merged = savedNodes.slice();
        merged.splice(insertAt, 1, ...includedNodes);
        ctx.nodes = merged;
      } else {
        ctx.nodes = savedNodes.concat(includedNodes);
      }
      break;
    }

    default:
      throw new Error(`Unknown pseudo op ${node.op} at line ${node.pos.line}`);
  }
}

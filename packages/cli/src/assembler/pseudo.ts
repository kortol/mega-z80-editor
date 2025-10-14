import { AsmContext } from "./context";
import { NodePseudo } from "./parser";
import { handleORG } from "./pseudo/org";
import { handleEND } from "./pseudo/end";
import { handleEQU, handleSYMLEN } from "./pseudo/equ";
import { handleDB, handleDW, handleDS, handleWORD32 } from "./pseudo/data";
import { handleEXTERN } from "./pseudo/extern";
import { handleSECTION } from "./pseudo/section";
import { handleALIGN } from "./pseudo/align";

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
    default:
      throw new Error(`Unknown pseudo op ${node.op} at line ${node.line}`);
  }
}

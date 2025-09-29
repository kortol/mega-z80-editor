import { AsmContext } from "./context";
import { NodePseudo } from "./parser";
import { handleORG, handleEND } from "./pseudo/orgend";
import { handleEQU, handleSYMLEN } from "./pseudo/equ";
import { handleDB, handleDW, handleWORD32 } from "./pseudo/data";

export function handlePseudo(ctx: AsmContext, node: NodePseudo): void {
  switch (node.op.toUpperCase()) {
    case "ORG": return handleORG(ctx, node);
    case "END": return handleEND(ctx);
    case "EQU": return handleEQU(ctx, node);
    case ".SYMLEN": return handleSYMLEN(ctx, node);
    case "DB": return handleDB(ctx, node);
    case "DW": return handleDW(ctx, node);
    case ".WORD32": return handleWORD32(ctx, node);
    default:
      throw new Error(`Unknown pseudo op ${node.op} at line ${node.line}`);
  }
}

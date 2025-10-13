import { AsmContext } from "./context";
import { NodePseudo } from "./parser";
import { handleORG } from "./pseudo/org";
import { handleEND } from "./pseudo/end";
import { handleEQU, handleSYMLEN } from "./pseudo/equ";
import { handleDB, handleDW, handleWORD32 } from "./pseudo/data";
import { handleEXTERN } from "./pseudo/extern";

export function handlePseudo(ctx: AsmContext, node: NodePseudo): void {
  switch (node.op.toUpperCase()) {
    case "ORG": return handleORG(ctx, node);
    case "END": return handleEND(ctx, node);
    case "EQU": return handleEQU(ctx, node);
    case "EXTERN": return handleEXTERN(ctx, node);
    case ".SYMLEN": return handleSYMLEN(ctx, node);
    case "DB": case "DEFB": return handleDB(ctx, node);
    case "DW": case "DEFW": return handleDW(ctx, node);
    case ".WORD32": return handleWORD32(ctx, node);
    default:
      throw new Error(`Unknown pseudo op ${node.op} at line ${node.line}`);
  }
}

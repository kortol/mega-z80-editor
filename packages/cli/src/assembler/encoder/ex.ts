import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { NodeInstr } from "../node";

/**
 * EX 命令群
 */
export function encodeEX(ctx: AsmContext, node: NodeInstr) {
  const [op1, op2] = node.args;
  const op1U = String(op1 ?? "").toUpperCase();
  const op2U = String(op2 ?? "").toUpperCase();

  // EX AF,AF'
  if (
    (op1U === "AF" && (op2U === "AF'" || op2U === "AF")) ||
    (op1U === "AF'" && (op2U === "AF" || op2U === "AF'"))
  ) {
    emitBytes(ctx, [0x08], node.pos);
    return;
  }

  // EX DE,HL
  if ((op1U === "DE" && op2U === "HL") || (op1U === "HL" && op2U === "DE")) {
    emitBytes(ctx, [0xEB], node.pos);
    return;
  }

  // EX (SP),HL
  if ((op1U === "(SP)" && op2U === "HL") || (op1U === "HL" && op2U === "(SP)")) {
    emitBytes(ctx, [0xE3], node.pos);
    return;
  }

  // EX (SP),IX
  if ((op1U === "(SP)" && op2U === "IX") || (op1U === "IX" && op2U === "(SP)")) {
    emitBytes(ctx, [0xDD, 0xE3], node.pos);
    return;
  }

  // EX (SP),IY
  if ((op1U === "(SP)" && op2U === "IY") || (op1U === "IY" && op2U === "(SP)")) {
    emitBytes(ctx, [0xFD, 0xE3], node.pos);
    return;
  }

  throw new Error(
    `Unsupported EX form '${op1},${op2}' (allowed: AF,AF' / DE,HL / (SP),HL/IX/IY)`
  );
}

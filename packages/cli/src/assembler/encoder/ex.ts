import { AsmContext } from "../context";
import { NodeInstr } from "../parser";

/**
 * EX 命令群
 */
export function encodeEX(ctx: AsmContext, node: NodeInstr) {
  const [op1, op2] = node.args;

  // EX AF,AF'
  if ((op1 === "AF" && op2 === "AF'") || (op1 === "AF'" && op2 === "AF")) {
    ctx.texts.push({ addr: ctx.loc, data: [0x08] });
    ctx.loc += 1;
    return;
  }

  // EX DE,HL
  if ((op1 === "DE" && op2 === "HL") || (op1 === "HL" && op2 === "DE")) {
    ctx.texts.push({ addr: ctx.loc, data: [0xEB] });
    ctx.loc += 1;
    return;
  }

  // EX (SP),HL
  if ((op1 === "(SP)" && op2 === "HL") || (op1 === "HL" && op2 === "(SP)")) {
    ctx.texts.push({ addr: ctx.loc, data: [0xE3] });
    ctx.loc += 1;
    return;
  }

  // EX (SP),IX
  if ((op1 === "(SP)" && op2 === "IX") || (op1 === "IX" && op2 === "(SP)")) {
    ctx.texts.push({ addr: ctx.loc, data: [0xDD, 0xE3] });
    ctx.loc += 2;
    return;
  }

  // EX (SP),IY
  if ((op1 === "(SP)" && op2 === "IY") || (op1 === "IY" && op2 === "(SP)")) {
    ctx.texts.push({ addr: ctx.loc, data: [0xFD, 0xE3] });
    ctx.loc += 2;
    return;
  }

  throw new Error(`Unsupported EX form at line ${node.line}`);
}

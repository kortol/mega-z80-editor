import { AsmContext } from "../context";
import { NodeInstr } from "../parser";
import { resolveValue, isReg8, regCode } from "./utils";

/**
 * IN / OUT 命令群
 */
export function encodeIO(ctx: AsmContext, node: NodeInstr) {
  const op = node.op.toUpperCase();
  const args = node.args;

  // --- IN A,(n) ---
  if (
    op === "IN" &&
    args.length === 2 &&
    args[0] === "A" &&
    args[1].startsWith("(")
  ) {
    const portExpr = args[1].slice(1, -1);
    const port = resolveValue(ctx, portExpr);
    if (port === null) {
      ctx.texts.push({ addr: ctx.loc, data: [0xdb, 0x00], line: node.line });
      ctx.unresolved.push({ addr: ctx.loc + 1, symbol: portExpr, size: 1 });
    } else {
      if (port < 0 || port > 0xff)
        throw new Error(`Port number out of range: ${args[1]}`);
      ctx.texts.push({ addr: ctx.loc, data: [0xdb, port & 0xff], line: node.line });
    }
    ctx.loc += 2;
    return;
  }

  // --- OUT (n),A ---
  if (
    op === "OUT" &&
    args.length === 2 &&
    args[0].startsWith("(") &&
    args[1] === "A"
  ) {
    const portExpr = args[0].slice(1, -1);
    const port = resolveValue(ctx, portExpr);
    if (port === null) {
      ctx.texts.push({ addr: ctx.loc, data: [0xd3, 0x00], line: node.line });
      ctx.unresolved.push({ addr: ctx.loc + 1, symbol: portExpr, size: 1 });
    } else {
      if (port < 0 || port > 0xff)
        throw new Error(`Port number out of range: ${args[0]}`);
      ctx.texts.push({ addr: ctx.loc, data: [0xd3, port & 0xff], line: node.line });
    }
    ctx.loc += 2;
    return;
  }

  // --- IN r,(C) ---
  if (
    op === "IN" &&
    args.length === 2 &&
    args[1] === "(C)" &&
    isReg8(args[0])
  ) {
    const code = 0x40 | (regCode(args[0]) << 3);
    ctx.texts.push({ addr: ctx.loc, data: [0xed, code], line: node.line });
    ctx.loc += 2;
    return;
  }

  // --- OUT (C),r ---
  if (
    op === "OUT" &&
    args.length === 2 &&
    args[0] === "(C)" &&
    isReg8(args[1])
  ) {
    const code = 0x41 | (regCode(args[1]) << 3);
    ctx.texts.push({ addr: ctx.loc, data: [0xed, code], line: node.line });
    ctx.loc += 2;
    return;
  }

  // --- IN (C) または IN F,(C) ---
  if (
    op === "IN" &&
    ((args.length === 1 && args[0] === "(C)") ||
      (args.length === 2 && args[0] === "F" && args[1] === "(C)"))
  ) {
    ctx.texts.push({ addr: ctx.loc, data: [0xed, 0x70], line: node.line });
    ctx.loc += 2;
    return;
  }

  // --- OUT (C),0 ---
  if (
    op === "OUT" &&
    args.length === 2 &&
    args[0] === "(C)" &&
    args[1] === "0"
  ) {
    ctx.texts.push({ addr: ctx.loc, data: [0xed, 0x71], line: node.line });
    ctx.loc += 2;
    return;
  }

  throw new Error(`Unsupported IO instruction ${op} ${args.join(",")}`);
}

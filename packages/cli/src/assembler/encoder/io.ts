import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { classifyOperand } from "../operand/classifyOperand";
import { OperandKind } from "../operand/operandKind";
import { InstrDef } from "./types";
import { resolveValue, isReg8, regCode } from "./utils";

export const inInstr: InstrDef[] = [
  // IN A,(n)
  {
    match: (_ctx, args) =>
      args.length === 2 &&
      args[0].kind === OperandKind.REG8 &&
      args[0].raw === "A" &&
      args[1].kind === OperandKind.MEM,
    encode(ctx, args, node) {
      const portExpr = args[1].raw.slice(1, -1);
      const port = resolveValue(ctx, portExpr);
      if (port === null) {
        emitBytes(ctx, [0xdb, 0x00], node.pos);
        ctx.unresolved.push({
          addr: ctx.loc + 1,
          symbol: portExpr,
          size: 1,
          requester: { op: node.op, phase: "assemble", pos: node.pos },
          sectionId: ctx.currentSection ?? 0,
        });
        return;
      }
      if (port < 0 || port > 0xff) {
        throw new Error(`Port number out of range: ${args[1].raw}`);
      }
      emitBytes(ctx, [0xdb, port & 0xff], node.pos);
    },
    estimate: 2,
  },

  // IN r,(C)
  {
    match: (_ctx, args) =>
      args.length === 2 &&
      args[1].kind === OperandKind.MEM &&
      args[1].raw === "(C)" &&
      isReg8(args[0].raw),
    encode(ctx, args, node) {
      const code = 0x40 | (regCode(args[0].raw) << 3);
      emitBytes(ctx, [0xed, code], node.pos);
    },
    estimate: 2,
  },

  // IN (C) / IN F,(C)
  {
    match: (_ctx, args) =>
      (args.length === 1 && args[0].kind === OperandKind.MEM && args[0].raw === "(C)") ||
      (args.length === 2 && args[0].raw === "F" && args[1].kind === OperandKind.MEM && args[1].raw === "(C)"),
    encode(ctx, _args, node) {
      emitBytes(ctx, [0xed, 0x70], node.pos);
    },
    estimate: 2,
  },

  // Explicit error: IN r,(n) where r != A and n != C
  {
    match: (_ctx, args) =>
      args.length === 2 &&
      args[1].kind === OperandKind.MEM &&
      args[1].raw !== "(C)" &&
      !(args[0].kind === OperandKind.REG8 && args[0].raw === "A"),
    encode(_ctx, args) {
      throw new Error(`Unsupported IN ${args[0].raw},${args[1].raw} (only IN A,(n) is supported)`);
    },
    estimate: 2,
  },

  {
    match: () => true,
    encode(_ctx, args, node) {
      throw new Error(`Unsupported IO instruction IN ${args.map(a => a.raw).join(",")} at ${node.pos.file}:${node.pos.line}`);
    },
    estimate: 2,
  },
];

export const outInstr: InstrDef[] = [
  // OUT (n),A
  {
    match: (_ctx, args) =>
      args.length === 2 &&
      args[0].kind === OperandKind.MEM &&
      args[0].raw !== "(C)" &&
      args[1].kind === OperandKind.REG8 &&
      args[1].raw === "A",
    encode(ctx, args, node) {
      const portExpr = args[0].raw.slice(1, -1);
      const port = resolveValue(ctx, portExpr);
      if (port === null) {
        emitBytes(ctx, [0xd3, 0x00], node.pos);
        ctx.unresolved.push({
          addr: ctx.loc + 1,
          symbol: portExpr,
          size: 1,
          requester: { op: node.op, phase: "assemble", pos: node.pos },
          sectionId: ctx.currentSection ?? 0,
        });
        return;
      }
      if (port < 0 || port > 0xff) {
        throw new Error(`Port number out of range: ${args[0].raw}`);
      }
      emitBytes(ctx, [0xd3, port & 0xff], node.pos);
    },
    estimate: 2,
  },

  // OUT (C),r
  {
    match: (_ctx, args) =>
      args.length === 2 &&
      args[0].kind === OperandKind.MEM &&
      args[0].raw === "(C)" &&
      isReg8(args[1].raw),
    encode(ctx, args, node) {
      const code = 0x41 | (regCode(args[1].raw) << 3);
      emitBytes(ctx, [0xed, code], node.pos);
    },
    estimate: 2,
  },

  // OUT (C),0
  {
    match: (ctx, args) =>
      args.length === 2 &&
      args[0].kind === OperandKind.MEM &&
      args[0].raw === "(C)" &&
      !isReg8(args[1].raw) &&
      resolveValue(ctx, args[1].raw) === 0,
    encode(ctx, _args, node) {
      emitBytes(ctx, [0xed, 0x71], node.pos);
    },
    estimate: 2,
  },

  // Explicit error: OUT (C),n where n != 0
  {
    match: (_ctx, args) =>
      args.length === 2 &&
      args[0].kind === OperandKind.MEM &&
      args[0].raw === "(C)" &&
      !isReg8(args[1].raw),
    encode(ctx, args) {
      const val = resolveValue(ctx, args[1].raw);
      if (val !== 0) {
        throw new Error(`Unsupported OUT (C),${args[1].raw} (only 0 is supported)`);
      }
      throw new Error(`Unsupported OUT (C),${args[1].raw}`);
    },
    estimate: 2,
  },

  // Explicit error: OUT (n),r where r != A
  {
    match: (_ctx, args) =>
      args.length === 2 &&
      args[0].kind === OperandKind.MEM &&
      args[0].raw !== "(C)" &&
      !(args[1].kind === OperandKind.REG8 && args[1].raw === "A"),
    encode(_ctx, args) {
      throw new Error(`Unsupported OUT ${args[0].raw},${args[1].raw} (only OUT (n),A is supported)`);
    },
    estimate: 2,
  },

  {
    match: () => true,
    encode(_ctx, args, node) {
      throw new Error(`Unsupported IO instruction OUT ${args.map(a => a.raw).join(",")} at ${node.pos.file}:${node.pos.line}`);
    },
    estimate: 2,
  },
];

export function encodeIO(ctx: AsmContext, node: NodeInstr) {
  const defs = node.op.toUpperCase() === "IN" ? inInstr : outInstr;
  const args = node.args.map(s => classifyOperand(ctx, s));
  for (const def of defs) {
    if (def.match(ctx, args)) {
      def.encode(ctx, args, node);
      return;
    }
  }
  throw new Error(`Unsupported IO instruction ${node.op} ${node.args.join(",")} at ${node.pos.file}:${node.pos.line}`);
}

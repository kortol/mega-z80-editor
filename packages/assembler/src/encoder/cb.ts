import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { classifyOperand } from "../operand/classifyOperand";
import { OperandKind } from "../operand/operandKind";
import { InstrDef } from "./types";
import { regCode } from "./utils";

const rotMap: Record<string, number> = {
  RLC: 0x00,
  RRC: 0x08,
  RL: 0x10,
  RR: 0x18,
  SLA: 0x20,
  SRA: 0x28,
  SLL: 0x30, // undocumented
  SRL: 0x38,
};

export const cbRotInstr: InstrDef[] = [
  {
    match: (_ctx, args) =>
      args.length === 1 &&
      (args[0].kind === OperandKind.REG8 || args[0].kind === OperandKind.REG_IND || args[0].kind === OperandKind.IDX),
    encode(ctx, [arg], node) {
      const op = node.op.toUpperCase();
      const base = rotMap[op];
      if (base == null) throw new Error(`Unsupported CB instruction ${op}`);
      if (arg.kind === OperandKind.IDX) {
        const prefix = arg.raw.startsWith("(IX") ? 0xdd : 0xfd;
        const disp = (arg.disp ?? 0) & 0xff;
        emitBytes(ctx, [prefix, 0xcb, disp, base | 0x06], node.pos);
        return;
      }
      const reg = regCode(arg.raw);
      emitBytes(ctx, [0xcb, base | reg], node.pos);
    },
    estimate: (_ctx, [arg]) => (arg.kind === OperandKind.IDX ? 4 : 2),
  },
  {
    match: () => true,
    encode(_ctx, args, node) {
      const op = node.op.toUpperCase();
      throw new Error(`Unsupported CB instruction ${op} ${args.map(a => a.raw).join(",")} (supported: RLC/RRC/RL/RR/SLA/SRA/SLL/SRL r/(HL)/(IX/IY+d))`);
    },
    estimate: 2,
  },
];

export const cbBitInstr: InstrDef[] = [
  {
    match: (_ctx, args) =>
      args.length === 2 &&
      (args[1].kind === OperandKind.REG8 || args[1].kind === OperandKind.REG_IND || args[1].kind === OperandKind.IDX),
    encode(ctx, [bitArg, arg], node) {
      const op = node.op.toUpperCase();
      const bit = parseInt(bitArg.raw, 10);
      if (Number.isNaN(bit) || bit < 0 || bit > 7) {
        throw new Error(`${op} bit index out of range: ${bitArg.raw}`);
      }
      const base = op === "BIT" ? 0x40 : op === "RES" ? 0x80 : 0xc0;
      if (arg.kind === OperandKind.IDX) {
        const prefix = arg.raw.startsWith("(IX") ? 0xdd : 0xfd;
        const disp = (arg.disp ?? 0) & 0xff;
        emitBytes(ctx, [prefix, 0xcb, disp, base | (bit << 3) | 0x06], node.pos);
        return;
      }
      const reg = regCode(arg.raw);
      emitBytes(ctx, [0xcb, base | (bit << 3) | reg], node.pos);
    },
    estimate: (_ctx, args) => (args[1].kind === OperandKind.IDX ? 4 : 2),
  },
  {
    match: () => true,
    encode(_ctx, args, node) {
      const op = node.op.toUpperCase();
      throw new Error(`Unsupported CB instruction ${op} ${args.map(a => a.raw).join(",")} (supported: BIT/RES/SET b,r/(HL)/(IX/IY+d))`);
    },
    estimate: 2,
  },
];

export function encodeCB(ctx: AsmContext, node: NodeInstr) {
  const defs = ["BIT", "RES", "SET"].includes(node.op.toUpperCase()) ? cbBitInstr : cbRotInstr;
  const args = node.args.map(s => classifyOperand(ctx, s));
  for (const def of defs) {
    if (def.match(ctx, args)) {
      def.encode(ctx, args, node);
      return;
    }
  }
  throw new Error(`Unsupported CB instruction ${node.op} ${node.args.join(",")}`);
}

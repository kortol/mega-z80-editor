import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { classifyOperand } from "../operand/classifyOperand";
import { InstrDef } from "./types";

const edNoArgTable: Record<string, number> = {
  LDI: 0xa0,
  LDIR: 0xb0,
  LDD: 0xa8,
  LDDR: 0xb8,
  CPI: 0xa1,
  CPIR: 0xb1,
  CPD: 0xa9,
  CPDR: 0xb9,
  INI: 0xa2,
  INIR: 0xb2,
  IND: 0xaa,
  INDR: 0xba,
  OUTI: 0xa3,
  OTIR: 0xb3,
  OUTD: 0xab,
  OTDR: 0xbb,
  NEG: 0x44,
  RETN: 0x45,
  RETI: 0x4d,
  RRD: 0x67,
  RLD: 0x6f,
};

export const edNoArgInstr: InstrDef[] = [
  {
    match: (_ctx, args) => args.length === 0,
    encode(ctx, _args, node) {
      const op = node.op.toUpperCase();
      const opcode = edNoArgTable[op];
      if (opcode == null) throw new Error(`Unsupported ED instruction ${op}`);
      emitBytes(ctx, [0xed, opcode], node.pos);
    },
    estimate: 2,
  },
  {
    match: () => true,
    encode(_ctx, args, node) {
      const op = node.op.toUpperCase();
      throw new Error(`Unsupported ED instruction ${op} ${args.map(a => a.raw).join(",")}`);
    },
    estimate: 2,
  },
];

export const imInstr: InstrDef[] = [
  {
    match: (_ctx, args) => args.length === 1,
    encode(ctx, [arg], node) {
      const mode = parseInt(arg.raw, 10);
      const codes = [0x46, 0x56, 0x5e];
      if (Number.isNaN(mode) || mode < 0 || mode > 2) {
        throw new Error(`Invalid IM mode: ${arg.raw}`);
      }
      emitBytes(ctx, [0xed, codes[mode]], node.pos);
    },
    estimate: 2,
  },
  {
    match: () => true,
    encode(_ctx, _args) {
      throw new Error("IM requires one argument");
    },
    estimate: 2,
  },
];

export function encodeED(ctx: AsmContext, node: NodeInstr) {
  const defs = node.op.toUpperCase() === "IM" ? imInstr : edNoArgInstr;
  const args = node.args.map(s => classifyOperand(ctx, s));
  for (const def of defs) {
    if (def.match(ctx, args)) {
      def.encode(ctx, args, node);
      return;
    }
  }
  throw new Error(`Unsupported ED instruction ${node.op} ${node.args.join(",")}`);
}

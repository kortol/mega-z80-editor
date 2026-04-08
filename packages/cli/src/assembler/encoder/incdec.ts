import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { classifyOperand } from "../operand/classifyOperand";
import { OperandKind } from "../operand/operandKind";
import { InstrDef } from "./types";
import { reg8Info, reg16Code } from "./utils";

export const incInstr: InstrDef[] = [
  {
    match: (_ctx, args) => args.length === 1 && (args[0].kind === OperandKind.REG8 || args[0].kind === OperandKind.REG8X),
    encode(ctx, [r], node) {
      const info = reg8Info(r.raw);
      if (!info) throw new Error(`Unsupported INC form at line ${node.pos.line}`);
      const opcode = 0x04 | (info.code << 3);
      emitBytes(ctx, info.prefix ? [info.prefix, opcode] : [opcode], node.pos);
    },
    estimate: (_ctx, [r]) => (r.kind === OperandKind.REG8X ? 2 : 1),
  },
  {
    match: (_ctx, args) => args.length === 1 && args[0].kind === OperandKind.REG_IND && args[0].raw === "(HL)",
    encode(ctx, _args, node) {
      emitBytes(ctx, [0x34], node.pos);
    },
    estimate: 1,
  },
  {
    match: (_ctx, args) => args.length === 1 && args[0].kind === OperandKind.IDX,
    encode(ctx, [r], node) {
      const prefix = r.raw.startsWith("(IX") ? 0xdd : 0xfd;
      const disp = (r.disp ?? 0) & 0xff;
      emitBytes(ctx, [prefix, 0x34, disp], node.pos);
    },
    estimate: 3,
  },
  {
    match: (_ctx, args) =>
      args.length === 1 &&
      args[0].kind === OperandKind.REG16 &&
      ["BC", "DE", "HL", "SP"].includes(args[0].raw),
    encode(ctx, [r], node) {
      const opcode = 0x03 | (reg16Code(r.raw) << 4);
      emitBytes(ctx, [opcode], node.pos);
    },
    estimate: 1,
  },
  {
    match: (_ctx, args) =>
      args.length === 1 &&
      args[0].kind === OperandKind.REG16X &&
      (args[0].raw === "IX" || args[0].raw === "IY"),
    encode(ctx, [r], node) {
      const prefix = r.raw === "IX" ? 0xdd : 0xfd;
      emitBytes(ctx, [prefix, 0x23], node.pos);
    },
    estimate: 2,
  },
  {
    match: () => true,
    encode(_ctx, _args, node) {
      throw new Error(`Unsupported INC form at line ${node.pos.line}`);
    },
    estimate: 1,
  },
];

export const decInstr: InstrDef[] = [
  {
    match: (_ctx, args) => args.length === 1 && (args[0].kind === OperandKind.REG8 || args[0].kind === OperandKind.REG8X),
    encode(ctx, [r], node) {
      const info = reg8Info(r.raw);
      if (!info) throw new Error(`Unsupported DEC form at line ${node.pos.line}`);
      const opcode = 0x05 | (info.code << 3);
      emitBytes(ctx, info.prefix ? [info.prefix, opcode] : [opcode], node.pos);
    },
    estimate: (_ctx, [r]) => (r.kind === OperandKind.REG8X ? 2 : 1),
  },
  {
    match: (_ctx, args) => args.length === 1 && args[0].kind === OperandKind.REG_IND && args[0].raw === "(HL)",
    encode(ctx, _args, node) {
      emitBytes(ctx, [0x35], node.pos);
    },
    estimate: 1,
  },
  {
    match: (_ctx, args) => args.length === 1 && args[0].kind === OperandKind.IDX,
    encode(ctx, [r], node) {
      const prefix = r.raw.startsWith("(IX") ? 0xdd : 0xfd;
      const disp = (r.disp ?? 0) & 0xff;
      emitBytes(ctx, [prefix, 0x35, disp], node.pos);
    },
    estimate: 3,
  },
  {
    match: (_ctx, args) =>
      args.length === 1 &&
      args[0].kind === OperandKind.REG16 &&
      ["BC", "DE", "HL", "SP"].includes(args[0].raw),
    encode(ctx, [r], node) {
      const opcode = 0x0b | (reg16Code(r.raw) << 4);
      emitBytes(ctx, [opcode], node.pos);
    },
    estimate: 1,
  },
  {
    match: (_ctx, args) =>
      args.length === 1 &&
      args[0].kind === OperandKind.REG16X &&
      (args[0].raw === "IX" || args[0].raw === "IY"),
    encode(ctx, [r], node) {
      const prefix = r.raw === "IX" ? 0xdd : 0xfd;
      emitBytes(ctx, [prefix, 0x2b], node.pos);
    },
    estimate: 2,
  },
  {
    match: () => true,
    encode(_ctx, _args, node) {
      throw new Error(`Unsupported DEC form at line ${node.pos.line}`);
    },
    estimate: 1,
  },
];

function encodeFromDefs(defs: InstrDef[], ctx: AsmContext, node: NodeInstr): void {
  const args = node.args.map(s => classifyOperand(ctx, s));
  for (const def of defs) {
    if (def.match(ctx, args)) {
      def.encode(ctx, args, node);
      return;
    }
  }
  throw new Error(`Unsupported ${node.op} form at line ${node.pos.line}`);
}

export function encodeINC(ctx: AsmContext, node: NodeInstr) {
  encodeFromDefs(incInstr, ctx, node);
}

export function encodeDEC(ctx: AsmContext, node: NodeInstr) {
  encodeFromDefs(decInstr, ctx, node);
}

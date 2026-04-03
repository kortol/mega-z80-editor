import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { OperandKind } from "../operand/operandKind";
import { InstrDef } from "./types";

function isPushPopReg(raw: string): boolean {
  return ["BC", "DE", "HL", "AF", "IX", "IY"].includes(raw.toUpperCase());
}

function isIndexReg(raw: string): boolean {
  return raw.toUpperCase() === "IX" || raw.toUpperCase() === "IY";
}

export const pushInstr: InstrDef[] = [
  {
    match: (ctx, [op]) =>
      !!op &&
      (op.kind === OperandKind.REG16 || op.kind === OperandKind.REG16X || op.kind === OperandKind.REG_AF) &&
      isPushPopReg(op.raw),
    encode(ctx, [op], node) {
      const r = op.raw.toUpperCase();
      if (isIndexReg(r)) {
        const prefix = r === "IX" ? 0xdd : 0xfd;
        emitBytes(ctx, [prefix, 0xe5], node.pos);
        return;
      }
      const table: Record<string, number> = {
        BC: 0xc5,
        DE: 0xd5,
        HL: 0xe5,
        AF: 0xf5,
      };
      const opcode = table[r];
      if (opcode === undefined) throw new Error(`Unsupported PUSH ${r}`);
      emitBytes(ctx, [opcode], node.pos);
    },
    estimate: (ctx, [op]) => (op && isIndexReg(op.raw) ? 2 : 1),
  },
];

export const popInstr: InstrDef[] = [
  {
    match: (ctx, [op]) =>
      !!op &&
      (op.kind === OperandKind.REG16 || op.kind === OperandKind.REG16X || op.kind === OperandKind.REG_AF) &&
      isPushPopReg(op.raw),
    encode(ctx, [op], node) {
      const r = op.raw.toUpperCase();
      if (isIndexReg(r)) {
        const prefix = r === "IX" ? 0xdd : 0xfd;
        emitBytes(ctx, [prefix, 0xe1], node.pos);
        return;
      }
      const table: Record<string, number> = {
        BC: 0xc1,
        DE: 0xd1,
        HL: 0xe1,
        AF: 0xf1,
      };
      const opcode = table[r];
      if (opcode === undefined) throw new Error(`Unsupported POP ${r}`);
      emitBytes(ctx, [opcode], node.pos);
    },
    estimate: (ctx, [op]) => (op && isIndexReg(op.raw) ? 2 : 1),
  },
];

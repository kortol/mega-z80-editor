import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { InstrDef } from "./types";

/**
 * 単発 Misc 命令
 */
export function encodeMisc(ctx: AsmContext, node: NodeInstr) {
  const opcodeTable: Record<string, number> = {
    NOP: 0x00,
    HALT: 0x76,
    DAA: 0x27,
    CPL: 0x2F,
    SCF: 0x37,
    CCF: 0x3F,
    DI: 0xF3,
    EI: 0xFB,
    RLCA: 0x07,
    RRCA: 0x0F,
    RLA: 0x17,
    RRA: 0x1F,
    EXX: 0xD9,
  };

  const opcode = opcodeTable[node.op.toUpperCase()];
  if (opcode === undefined) {
    throw new Error(`Unsupported misc instruction ${node.op}`);
  }

  emitBytes(ctx, [opcode], node.pos);
}

export const miscInstr: InstrDef[] = [
  {
    match: (_ctx, args) => args.length === 0,
    encode(ctx, _args, node) {
      encodeMisc(ctx, node);
    },
    estimate: 1,
  },
  {
    match: () => true,
    encode(_ctx, _args, node) {
      throw new Error(`Unsupported misc instruction ${node.op}`);
    },
    estimate: 1,
  },
];

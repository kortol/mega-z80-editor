import { AsmContext } from "../context";
import { NodeInstr } from "../parser";

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

  ctx.texts.push({ addr: ctx.loc, data: [opcode] });
  ctx.loc += 1;
}

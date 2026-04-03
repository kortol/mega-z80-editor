import { makeALUDefs, } from "./alu";
import { CALLInstrDefs, DJNZInstrDefs, JPInstrDefs, JRInstrDefs, RETInstrDefs, RSTInstrDefs } from "./jump";
import { ldInstr } from "./ld";
import { popInstr, pushInstr } from "./stack";
import { InstrDef } from "./types";

export const instrTable: Record<string, InstrDef[]> = {
  LD: ldInstr,

  // ALU: 即値(式)対応＋（ADDのみ）ADD HL,rr
  ADD: makeALUDefs("ADD", { has16bit: true, allowImplicitA: true }),
  ADC: makeALUDefs("ADC", { has16bit: true, allowImplicitA: true }),
  SUB: makeALUDefs("SUB", { allowImplicitA: true }),
  SBC: makeALUDefs("SBC", { has16bit: true, allowImplicitA: true }),
  AND: makeALUDefs("AND", { allowImplicitA: true }),
  OR: makeALUDefs("OR", { allowImplicitA: true }),
  XOR: makeALUDefs("XOR", { allowImplicitA: true }),
  CP: makeALUDefs("CP", { allowImplicitA: true }),

  // 分岐命令
  JP: JPInstrDefs,
  JR: JRInstrDefs,
  CALL: CALLInstrDefs,
  RET: RETInstrDefs,
  RST: RSTInstrDefs,
  DJNZ: DJNZInstrDefs,

  // Stack
  PUSH: pushInstr,
  POP: popInstr,
};

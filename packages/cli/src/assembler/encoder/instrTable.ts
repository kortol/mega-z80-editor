import { AsmContext } from "../context";
import { OperandInfo } from "../operand/classifyOperand";
import { NodeInstr } from "../parser";
import { makeALUDefs, } from "./alu";
import { djnzInstr, jrInstr } from "./branch";
import { ldInstr } from "./ld";
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
  JR: jrInstr,
  DJNZ: djnzInstr,
};

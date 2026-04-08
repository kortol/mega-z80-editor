import { makeALUDefs } from "./alu";
import { cbBitInstr, cbRotInstr } from "./cb";
import { edNoArgInstr, imInstr } from "./ed";
import { exInstr } from "./ex";
import { decInstr, incInstr } from "./incdec";
import { inInstr, outInstr } from "./io";
import { CALLInstrDefs, DJNZInstrDefs, JPInstrDefs, JRInstrDefs, RETInstrDefs, RSTInstrDefs } from "./jump";
import { ldInstr } from "./ld";
import { popInstr, pushInstr } from "./stack";
import { InstrDef } from "./types";
import { miscInstr } from "./misc";

const throwExtendedUnsupported = (op: string): InstrDef[] => [
  {
    match: () => true,
    encode: (_ctx, _args, node) => {
      const args = node.args.join(",");
      throw new Error(
        `Unsupported extended instruction ${op}${args ? " " + args : ""} (R800/Z280 not implemented)`
      );
    },
    estimate: 1,
  },
];

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

  INC: incInstr,
  DEC: decInstr,
  EX: exInstr,

  IN: inInstr,
  OUT: outInstr,

  NOP: miscInstr,
  HALT: miscInstr,
  DAA: miscInstr,
  CPL: miscInstr,
  SCF: miscInstr,
  CCF: miscInstr,
  DI: miscInstr,
  EI: miscInstr,
  RLCA: miscInstr,
  RRCA: miscInstr,
  RLA: miscInstr,
  RRA: miscInstr,
  EXX: miscInstr,

  RLC: cbRotInstr,
  RRC: cbRotInstr,
  RL: cbRotInstr,
  RR: cbRotInstr,
  SLA: cbRotInstr,
  SRA: cbRotInstr,
  SLL: cbRotInstr,
  SRL: cbRotInstr,
  BIT: cbBitInstr,
  RES: cbBitInstr,
  SET: cbBitInstr,

  LDI: edNoArgInstr,
  LDIR: edNoArgInstr,
  LDD: edNoArgInstr,
  LDDR: edNoArgInstr,
  CPI: edNoArgInstr,
  CPIR: edNoArgInstr,
  CPD: edNoArgInstr,
  CPDR: edNoArgInstr,
  INI: edNoArgInstr,
  INIR: edNoArgInstr,
  IND: edNoArgInstr,
  INDR: edNoArgInstr,
  OUTI: edNoArgInstr,
  OTIR: edNoArgInstr,
  OUTD: edNoArgInstr,
  OTDR: edNoArgInstr,
  NEG: edNoArgInstr,
  RETN: edNoArgInstr,
  RETI: edNoArgInstr,
  RRD: edNoArgInstr,
  RLD: edNoArgInstr,
  IM: imInstr,

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

  // --- Extended ISA (R800/Z280 etc.) ---
  MULUB: throwExtendedUnsupported("MULUB"),
  MULUW: throwExtendedUnsupported("MULUW"),
  SLP: throwExtendedUnsupported("SLP"),
  MLT: throwExtendedUnsupported("MLT"),
  IN0: throwExtendedUnsupported("IN0"),
  OUT0: throwExtendedUnsupported("OUT0"),
  INO: throwExtendedUnsupported("INO"),
  OUTO: throwExtendedUnsupported("OUTO"),
  OTIM: throwExtendedUnsupported("OTIM"),
  OTIMR: throwExtendedUnsupported("OTIMR"),
  OTDM: throwExtendedUnsupported("OTDM"),
  OTDMR: throwExtendedUnsupported("OTDMR"),
  TSTIO: throwExtendedUnsupported("TSTIO"),
  TST: throwExtendedUnsupported("TST"),
  MULT: throwExtendedUnsupported("MULT"),
  MULTU: throwExtendedUnsupported("MULTU"),
  MULTW: throwExtendedUnsupported("MULTW"),
  DIV: throwExtendedUnsupported("DIV"),
  DIVU: throwExtendedUnsupported("DIVU"),
  JAF: throwExtendedUnsupported("JAF"),
  JAR: throwExtendedUnsupported("JAR"),
  LDUP: throwExtendedUnsupported("LDUP"),
  LOUD: throwExtendedUnsupported("LOUD"),
};

import { makeALUDefs } from "./alu";
import { encodeCB } from "./cb";
import { encodeED } from "./ed";
import { encodeEX } from "./ex";
import { encodeINC, encodeDEC } from "./incdec";
import { encodeIO } from "./io";
import { CALLInstrDefs, DJNZInstrDefs, JPInstrDefs, JRInstrDefs, RETInstrDefs, RSTInstrDefs } from "./jump";
import { ldInstr } from "./ld";
import { encodeMisc } from "./misc";
import { popInstr, pushInstr } from "./stack";
import { InstrDef } from "./types";
import { OperandKind } from "../operand/operandKind";

const passthrough = (
  encode: (ctx: any, node: any) => void,
  estimate: number | ((ctx: any, args: any[], node: any) => number)
): InstrDef[] => [
  {
    match: () => true,
    encode: (ctx, _args, node) => encode(ctx, node),
    estimate,
  },
];

const estimateIncDec = (_ctx: any, args: any[]) => {
  const arg = args[0];
  if (!arg) return 1;
  if (arg.kind === OperandKind.IDX) return 3;
  if (arg.kind === OperandKind.REG8X || arg.kind === OperandKind.REG16X) return 2;
  return 1;
};

const estimateEx = (_ctx: any, args: any[]) => {
  const lhs = args[0]?.raw ?? "";
  const rhs = args[1]?.raw ?? "";
  return lhs === "IX" || lhs === "IY" || rhs === "IX" || rhs === "IY" ? 2 : 1;
};

const estimateCB = (_ctx: any, args: any[]) => {
  const hasIdx = args.some(arg => arg.kind === OperandKind.IDX);
  return hasIdx ? 4 : 2;
};

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

  INC: passthrough(encodeINC, estimateIncDec),
  DEC: passthrough(encodeDEC, estimateIncDec),
  EX: passthrough(encodeEX, estimateEx),

  IN: passthrough(encodeIO, 2),
  OUT: passthrough(encodeIO, 2),

  NOP: passthrough(encodeMisc, 1),
  HALT: passthrough(encodeMisc, 1),
  DAA: passthrough(encodeMisc, 1),
  CPL: passthrough(encodeMisc, 1),
  SCF: passthrough(encodeMisc, 1),
  CCF: passthrough(encodeMisc, 1),
  DI: passthrough(encodeMisc, 1),
  EI: passthrough(encodeMisc, 1),
  RLCA: passthrough(encodeMisc, 1),
  RRCA: passthrough(encodeMisc, 1),
  RLA: passthrough(encodeMisc, 1),
  RRA: passthrough(encodeMisc, 1),
  EXX: passthrough(encodeMisc, 1),

  RLC: passthrough(encodeCB, estimateCB),
  RRC: passthrough(encodeCB, estimateCB),
  RL: passthrough(encodeCB, estimateCB),
  RR: passthrough(encodeCB, estimateCB),
  SLA: passthrough(encodeCB, estimateCB),
  SRA: passthrough(encodeCB, estimateCB),
  SLL: passthrough(encodeCB, estimateCB),
  SRL: passthrough(encodeCB, estimateCB),
  BIT: passthrough(encodeCB, estimateCB),
  RES: passthrough(encodeCB, estimateCB),
  SET: passthrough(encodeCB, estimateCB),

  LDI: passthrough(encodeED, 2),
  LDIR: passthrough(encodeED, 2),
  LDD: passthrough(encodeED, 2),
  LDDR: passthrough(encodeED, 2),
  CPI: passthrough(encodeED, 2),
  CPIR: passthrough(encodeED, 2),
  CPD: passthrough(encodeED, 2),
  CPDR: passthrough(encodeED, 2),
  INI: passthrough(encodeED, 2),
  INIR: passthrough(encodeED, 2),
  IND: passthrough(encodeED, 2),
  INDR: passthrough(encodeED, 2),
  OUTI: passthrough(encodeED, 2),
  OTIR: passthrough(encodeED, 2),
  OUTD: passthrough(encodeED, 2),
  OTDR: passthrough(encodeED, 2),
  NEG: passthrough(encodeED, 2),
  RETN: passthrough(encodeED, 2),
  RETI: passthrough(encodeED, 2),
  RRD: passthrough(encodeED, 2),
  RLD: passthrough(encodeED, 2),
  IM: passthrough(encodeED, 2),

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

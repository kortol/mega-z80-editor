// packages\cli\src\assembler\encoder.ts
import { AsmContext } from "./context";
import { NodeInstr } from "./parser";
import { encodeLD } from "./encoder/ld";
import {
  encodeADD,
  encodeADC,
  encodeSUB,
  encodeSBC,
  encodeAND,
  encodeOR,
  encodeXOR,
  encodeCP,
} from "./encoder/alu";
import { encodeINC, encodeDEC } from "./encoder/incdec";
// import { encodeJP, encodeJR, encodeCALL, encodeRET, encodeRST, encodeDJNZ, } from "./encoder/jump";
import { encodeEX } from "./encoder/ex";
import { encodeMisc } from "./encoder/misc";
import { encodeCB } from "./encoder/cb";
import { encodeIO } from "./encoder/io";
import { encodeED } from "./encoder/ed";


import { instrTable } from "./encoder/instrTable";
import { classifyOperand } from "./operand/classifyOperand";

// --- 命令長の見積もり ---
export function estimateInstrSize(ctx: AsmContext, node: NodeInstr): number {
  const defs = instrTable[node.op];
  const operand = node.args.map(classifyOperand)
  if (defs) {
    for (const def of defs) {
      if (def.match(ctx, operand)) {
        if (typeof def.estimate === "function") {
          return def.estimate(ctx, operand, node);
        } else {
          return def.estimate ?? 1;
        }
      }
    }
  }
  return 1;
}

export function encodeInstr(ctx: AsmContext, node: NodeInstr) {
  const defs = instrTable[node.op];
  const operand = node.args.map(classifyOperand)
  // console.log(`node:${JSON.stringify(node)},operand:${JSON.stringify(operand)}`);
  if (defs) {
    for (const def of defs) {
      if (def.match(ctx, operand)) {
        return def.encode(ctx, operand, node);
      }
    }
  }
  // fallback
  return encodeLegacyInstr(ctx, node);
}

export function encodeLegacyInstr(ctx: AsmContext, node: NodeInstr) {
  switch (node.op) {
    case "LD":
      encodeLD(ctx, node);
      break;
    case "INC":
      encodeINC(ctx, node);
      break;
    case "DEC":
      encodeDEC(ctx, node);
      break;
    case "ADD":
      encodeADD(ctx, node);
      break;
    case "ADC":
      encodeADC(ctx, node);
      break;
    case "SUB":
      encodeSUB(ctx, node);
      break;
    case "SBC":
      encodeSBC(ctx, node);
      break;
    case "AND":
      encodeAND(ctx, node);
      break;
    case "OR":
      encodeOR(ctx, node);
      break;
    case "XOR":
      encodeXOR(ctx, node);
      break;
    case "CP":
      encodeCP(ctx, node);
      break;

    // // --- Jump/Call/Return 系 ---
    // case "JP":
    //   encodeJP(ctx, node);
    //   break;
    // case "JR":
    //   encodeJR(ctx, node);
    //   break;
    // case "CALL":
    //   encodeCALL(ctx, node);
    //   break;
    // case "RET":
    //   encodeRET(ctx, node);
    //   break;
    // case "RST":
    //   encodeRST(ctx, node);
    //   break;
    // case "DJNZ":
    //   encodeDJNZ(ctx, node);
    //   break;

    case "EX":
      encodeEX(ctx, node);
      break;

    // --- Misc 単発命令 ---
    case "NOP":
    case "HALT":
    case "DAA":
    case "CPL":
    case "SCF":
    case "CCF":
    case "DI":
    case "EI":
    case "RLCA":
    case "RRCA":
    case "RLA":
    case "RRA":
    case "EXX":
      encodeMisc(ctx, node);
      break;

    case "RLC":
    case "RRC":
    case "RL":
    case "RR":
    case "SLA":
    case "SRA":
    case "SLL":
    case "SRL":
    case "BIT":
    case "RES":
    case "SET":
      encodeCB(ctx, node);
      break;

    case "IN":
    case "OUT":
      encodeIO(ctx, node);
      break;

    case "LDI":
    case "LDIR":
    case "LDD":
    case "LDDR":
    case "NEG":
    case "RETN":
    case "RETI":
    case "RRD":
    case "RLD":
    case "LD": // (A,I) 等のパターンで ED 対応
    case "IM":
      encodeED(ctx, node);
      break;

    default:
      throw new Error(
        `Unsupported instruction ${node.op} at line ${node.line}`
      );
  }
}

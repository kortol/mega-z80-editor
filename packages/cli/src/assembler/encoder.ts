import { AsmContext } from "./context";
import { NodeInstr } from "./parser";
import { parseNumber } from "./tokenizer";
import {
  resolveValue,
  regCode,
  isReg8,
} from "./encoder/utils";
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
import { encodeJP, encodeJR, encodeCALL, encodeRET, encodeRST, encodeDJNZ,  } from "./encoder/jump";
import { encodeEX } from "./encoder/ex";
import { encodeMisc } from "./encoder/misc";
import { encodeCB } from "./encoder/cb";
import { encodeIO } from "./encoder/io";
import { encodeED } from "./encoder/ed";

export function encodeInstr(ctx: AsmContext, node: NodeInstr) {
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

    // --- Jump/Call/Return 系 ---
    case "JP":
      encodeJP(ctx, node);
      break;
    case "JR":
      encodeJR(ctx, node);
      break;
    case "CALL":
      encodeCALL(ctx, node);
      break;
    case "RET":
      encodeRET(ctx, node);
      break;
    case "RST":
      encodeRST(ctx, node);
      break;
    case "DJNZ":
      encodeDJNZ(ctx, node);
      break;

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

// function encodeED(ctx: AsmContext, node: NodeInstr) {
//   const op = node.op.toUpperCase();
//   const args = node.args.map((a) => a.toUpperCase());

//   // 単純マップ
//   const table: Record<string, number> = {
//     LDI: 0xa0,
//     LDIR: 0xb0,
//     LDD: 0xa8,
//     LDDR: 0xb8,
//     NEG: 0x44,
//     RETN: 0x45,
//     RETI: 0x4d,
//     RRD: 0x67,
//     RLD: 0x6f,
//   };

//   // 単純に決まるやつ
//   const key = [op, ...args].join(" ");
//   if (table[key]) {
//     ctx.texts.push({ addr: ctx.loc, data: [0xed, table[key]] });
//     return;
//   }

//   // IM n
//   if (op === "IM") {
//     const mode = parseInt(args[0], 10);
//     const codes = [0x46, 0x56, 0x5e];
//     if (isNaN(mode) || mode < 0 || mode > 2) {
//       throw new Error(`Invalid IM mode: ${args[0]}`);
//     }
//     ctx.texts.push({ addr: ctx.loc, data: [0xed, codes[mode]] });
//     return;
//   }

//   throw new Error(`Unsupported ED instruction ${op} ${args.join(",")}`);
// }


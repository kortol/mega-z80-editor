import { AsmContext } from "./context";
import { NodeInstr } from "./parser";
import { parseNumber } from "./tokenizer";
import {
  resolveValue,
  regCode,
  reg16Code,
  isReg8,
  isReg16,
  isImm8,
  isImm16,
} from "./encoder/utils";
import { encodeLD } from "./encoder/ld";

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

// --- 共通: 8bit ALU演算 ---
function encodeALU(
  ctx: AsmContext,
  node: NodeInstr,
  base: number, // A,r の基本オペコード (下位3bitが r)
  immOpcode: number, // 即値
  hlOpcode: number // (HL)
) {
  let dst = "A";
  let src: string;

  if (node.args.length === 1) {
    src = node.args[0]; // 短縮形: AND C, CP 1
  } else if (node.args.length === 2) {
    dst = node.args[0]; // 拡張形: AND A,C
    src = node.args[1];
    if (dst !== "A") {
      throw new Error(`Unsupported ${node.op} form at line ${node.line}`);
    }
  } else {
    throw new Error(`Unsupported ${node.op} form at line ${node.line}`);
  }

  // --- レジスタ版
  if (isReg8(src)) {
    const opcode = base | regCode(src);
    ctx.texts.push({ addr: ctx.loc, data: [opcode] });
    ctx.loc += 1;
    return;
  }
  // --- (HL)版
  if (src === "(HL)") {
    ctx.texts.push({ addr: ctx.loc, data: [hlOpcode] });
    ctx.loc += 1;
    return;
  }
  // --- 即値版
  if (isImm8(ctx, src)) {
    const val = resolveValue(ctx, src);
    if (val === null) {
      // 未解決シンボル
      ctx.texts.push({ addr: ctx.loc, data: [immOpcode, 0x00] });
      ctx.unresolved.push({ addr: ctx.loc + 1, symbol: src, size: 1 });
    } else {
      ctx.texts.push({ addr: ctx.loc, data: [immOpcode, val & 0xff] });
    }
    ctx.loc += 2;
    return;
  }
  throw new Error(`Unsupported ${node.op} form at line ${node.line}`);
}

function encodeADD(ctx: AsmContext, node: NodeInstr) {
  const [dst, src] = node.args;
  if (dst === "A") {
    return encodeALU(ctx, node, 0x80, 0xc6, 0x86);
  }
  // 既存の16bit ADD HL,ss はここで処理済み
  if (
    dst === "HL" &&
    ["BC", "DE", "HL", "SP"].includes(src)
  ) {
    const opcode = 0x09 | (reg16Code(src) << 4);
    ctx.texts.push({ addr: ctx.loc, data: [opcode] });
    ctx.loc += 1;
    return;
  }
// --- ADD IX,rr ---
  if (dst === "IX" && ["BC","DE","IX","SP"].includes(src)) {
    const table: Record<string, number> = { BC: 0x09, DE: 0x19, IX: 0x29, SP: 0x39 };
    const opcode = table[src];
    ctx.texts.push({ addr: ctx.loc, data: [0xdd, opcode] });
    ctx.loc += 2;
    return;
  }
  // --- ADD IY,rr ---
  if (dst === "IY" && ["BC","DE","IY","SP"].includes(src)) {
    const table: Record<string, number> = { BC: 0x09, DE: 0x19, IY: 0x29, SP: 0x39 };
    const opcode = table[src];
    ctx.texts.push({ addr: ctx.loc, data: [0xfd, opcode] });
    ctx.loc += 2;
    return;
  }
  throw new Error(`Unsupported ADD form at line ${node.line}`);
}

function encodeADC(ctx: AsmContext, node: NodeInstr) {
  if (node.args[0] === "A") {
    return encodeALU(ctx, node, 0x88, 0xce, 0x8e);
  }
  throw new Error(`Unsupported ADC form at line ${node.line}`);
}

function encodeSUB(ctx: AsmContext, node: NodeInstr) {
  // SUB は dst なし → SUB r / SUB n / SUB (HL)
  const src = node.args[0];
  if (isReg8(src)) {
    const opcode = 0x90 | regCode(src);
    ctx.texts.push({ addr: ctx.loc, data: [opcode] });
    ctx.loc += 1;
    return;
  }
  if (src === "(HL)") {
    ctx.texts.push({ addr: ctx.loc, data: [0x96] });
    ctx.loc += 1;
    return;
  }
  if (isImm16(ctx, src)) {
    const val = resolveValue(ctx, src);
    if (val === null) {
      // 未解決シンボル
      ctx.texts.push({ addr: ctx.loc, data: [0xd6, 0x00] });
      ctx.unresolved.push({ addr: ctx.loc + 1, symbol: src, size: 1 });
    } else {
      ctx.texts.push({ addr: ctx.loc, data: [0xd6, val & 0xff] });
    }
    ctx.loc += 2;
    return;
  }
  throw new Error(`Unsupported SUB form at line ${node.line}`);
}

function encodeSBC(ctx: AsmContext, node: NodeInstr) {
  if (node.args[0] === "A") {
    return encodeALU(ctx, node, 0x98, 0xde, 0x9e);
  }
  throw new Error(`Unsupported SBC form at line ${node.line}`);
}

function encodeAND(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0xa0, 0xe6, 0xa6);
}

function encodeOR(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0xb0, 0xf6, 0xb6);
}

function encodeXOR(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0xa8, 0xee, 0xae);
}

function encodeCP(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0xb8, 0xfe, 0xbe);
}

function encodeINC(ctx: AsmContext, node: NodeInstr) {
  const r = node.args[0];
  if (isReg8(r)) {
    const opcode = 0x04 | (regCode(r) << 3);
    ctx.texts.push({ addr: ctx.loc, data: [opcode] });
    ctx.loc += 1;
    return;
  }
  if (["BC", "DE", "HL", "SP"].includes(r)) {
    const opcode = 0x03 | (reg16Code(r) << 4);
    ctx.texts.push({ addr: ctx.loc, data: [opcode] });
    ctx.loc += 1;
    return;
  }
  throw new Error(`Unsupported INC form at line ${node.line}`);
}

function encodeDEC(ctx: AsmContext, node: NodeInstr) {
  const r = node.args[0];
  if (isReg8(r)) {
    const opcode = 0x05 | (regCode(r) << 3);
    ctx.texts.push({ addr: ctx.loc, data: [opcode] });
    ctx.loc += 1;
    return;
  }
  if (["BC", "DE", "HL", "SP"].includes(r)) {
    const opcode = 0x0b | (reg16Code(r) << 4);
    ctx.texts.push({ addr: ctx.loc, data: [opcode] });
    ctx.loc += 1;
    return;
  }
  throw new Error(`Unsupported DEC form at line ${node.line}`);
}

// --- 条件コードテーブル ---
const condCodes: Record<string, number> = {
  NZ: 0x00,
  Z: 0x08,
  NC: 0x10,
  C: 0x18,
  PO: 0x20,
  PE: 0x28,
  P: 0x30,
  M: 0x38,
};

// --- JP ---
function encodeJP(ctx: AsmContext, node: NodeInstr) {
  if (node.args.length === 1) {
    const target = node.args[0];
    if (target === "(HL)") {
      ctx.texts.push({ addr: ctx.loc, data: [0xe9] });
      ctx.loc += 1;
      return;
    }
    if (target === "(IX)") {
      ctx.texts.push({ addr: ctx.loc, data: [0xdd, 0xe9] });
      ctx.loc += 2;
      return;
    }
    if (target === "(IY)") {
      ctx.texts.push({ addr: ctx.loc, data: [0xfd, 0xe9] });
      ctx.loc += 2;
      return;
    }
    const val = resolveValue(ctx, target);
    if (val === null) {
      ctx.texts.push({ addr: ctx.loc, data: [0xc3, 0, 0] });
      ctx.unresolved.push({ addr: ctx.loc + 1, symbol: target, size: 2 });
    } else {
      ctx.texts.push({
        addr: ctx.loc,
        data: [0xc3, val & 0xff, (val >> 8) & 0xff],
      });
    }
    ctx.loc += 3;
    return;
  }
  if (node.args.length === 2) {
    const cond = node.args[0];
    const target = node.args[1];
    if (!(cond in condCodes))
      throw new Error(`Unsupported JP condition ${cond}`);
    const val = resolveValue(ctx, target);
    if (val === null) {
      ctx.texts.push({ addr: ctx.loc, data: [0xc2 | condCodes[cond], 0, 0] });
      ctx.unresolved.push({ addr: ctx.loc + 1, symbol: target, size: 2 });
    } else {
      const opcode = 0xc2 | condCodes[cond];
      ctx.texts.push({
        addr: ctx.loc,
        data: [opcode, val & 0xff, (val >> 8) & 0xff],
      });
    }
    ctx.loc += 3;
    return;
  }
  throw new Error(`Unsupported JP form at line ${node.line}`);
}

// --- JR ---
function encodeJR(ctx: AsmContext, node: NodeInstr) {
  let cond: string | null = null;
  let target: string;

  if (node.args.length === 1) {
    target = node.args[0];
  } else if (node.args.length === 2) {
    cond = node.args[0];
    target = node.args[1];
  } else {
    throw new Error(`Invalid JR args at line ${node.line}`);
  }

  const val = resolveValue(ctx, target);
  if (val === null) {
    // unresolved シンボル
    const opcode = cond
      ? ({ NZ: 0x20, Z: 0x28, NC: 0x30, C: 0x38 } as Record<string, number>)[
          cond
        ] ?? null
      : 0x18;
    if (opcode === null) throw new Error(`JR only supports NZ/Z/NC/C`);
    ctx.texts.push({ addr: ctx.loc, data: [opcode, 0x00] });
    ctx.unresolved.push({
      addr: ctx.loc + 1,
      symbol: target,
      size: 1,
      relative: true,
    });
    ctx.loc += 2;
    return;
  }

  const offset = val - (ctx.loc + 2);
  if (offset < -128 || offset > 127) {
    throw new Error(`JR target out of range at line ${node.line}`);
  }

  if (!cond) {
    ctx.texts.push({ addr: ctx.loc, data: [0x18, offset & 0xff] });
    ctx.loc += 2;
    return;
  }

  const base = { NZ: 0x20, Z: 0x28, NC: 0x30, C: 0x38 }[cond];
  if (base === undefined) throw new Error(`JR only supports NZ/Z/NC/C`);
  ctx.texts.push({ addr: ctx.loc, data: [base, offset & 0xff] });
  ctx.loc += 2;
}

// --- CALL ---
function encodeCALL(ctx: AsmContext, node: NodeInstr) {
  if (node.args.length === 1) {
    const val = resolveValue(ctx, node.args[0]);
    if (val === null) {
      ctx.texts.push({ addr: ctx.loc, data: [0xcd, 0, 0] });
      ctx.unresolved.push({ addr: ctx.loc + 1, symbol: node.args[0], size: 2 });
    } else {
      ctx.texts.push({
        addr: ctx.loc,
        data: [0xcd, val & 0xff, (val >> 8) & 0xff],
      });
    }
    ctx.loc += 3;
    return;
  }
  if (node.args.length === 2) {
    const cond = node.args[0];
    const val = resolveValue(ctx, node.args[1]);
    if (!(cond in condCodes))
      throw new Error(`Unsupported CALL condition ${cond}`);
    const opcode = 0xc4 | condCodes[cond];
    if (val === null) {
      ctx.texts.push({ addr: ctx.loc, data: [opcode, 0, 0] });
      ctx.unresolved.push({ addr: ctx.loc + 1, symbol: node.args[1], size: 2 });
    } else {
      ctx.texts.push({
        addr: ctx.loc,
        data: [opcode, val & 0xff, (val >> 8) & 0xff],
      });
    }
    ctx.loc += 3;
    return;
  }
  throw new Error(`Unsupported CALL form at line ${node.line}`);
}

// --- RET ---
function encodeRET(ctx: AsmContext, node: NodeInstr) {
  if (node.args.length === 0) {
    ctx.texts.push({ addr: ctx.loc, data: [0xc9] });
    ctx.loc += 1;
    return;
  }
  const cond = node.args[0];
  if (!(cond in condCodes))
    throw new Error(`Unsupported RET condition ${cond}`);
  const opcode = 0xc0 | condCodes[cond];
  ctx.texts.push({ addr: ctx.loc, data: [opcode] });
  ctx.loc += 1;
}

// --- RST ---
function encodeRST(ctx: AsmContext, node: NodeInstr) {
  const val = resolveValue(ctx, node.args[0]);
  if (val === null) {
    throw new Error(`Unresolved symbol in RST not supported: ${node.args[0]}`);
  }
  if (val % 8 !== 0 || val < 0 || val > 0x38) {
    throw new Error(`Invalid RST vector ${val}`);
  }
  const opcode = 0xc7 + val; // 例: 0xC7, 0xCF, 0xD7, ..., 0xFF
  ctx.texts.push({ addr: ctx.loc, data: [opcode] });
  ctx.loc += 1;
}

// --- DJNZ ---
// --- DJNZ ---
function encodeDJNZ(ctx: AsmContext, node: NodeInstr) {
  if (node.args.length !== 1) {
    throw new Error(`Invalid DJNZ args at line ${node.line}`);
  }

  const target = node.args[0];
  const val = resolveValue(ctx, target);

  if (val === null) {
    // 未解決シンボル → unresolved に登録
    ctx.texts.push({ addr: ctx.loc, data: [0x10, 0x00] });
    ctx.unresolved.push({
      addr: ctx.loc + 1,
      symbol: target,
      size: 1,
      relative: true,
    });
    ctx.loc += 2;
    return;
  }

  const offset = val - (ctx.loc + 2);
  if (offset < -128 || offset > 127) {
    throw new Error(`DJNZ target out of range at line ${node.line}`);
  }

  ctx.texts.push({ addr: ctx.loc, data: [0x10, offset & 0xff] });
  ctx.loc += 2;
}

// --- EX 系 ---
function encodeEX(ctx: AsmContext, node: NodeInstr) {
  const [op1, op2] = node.args;
  if ((op1 === "AF" && op2 === "AF'") || (op1 === "AF'" && op2 === "AF")) {
    ctx.texts.push({ addr: ctx.loc, data: [0x08] });
    ctx.loc += 1;
    return;
  }
  if ((op1 === "DE" && op2 === "HL") || (op1 === "HL" && op2 === "DE")) {
    ctx.texts.push({ addr: ctx.loc, data: [0xeb] });
    ctx.loc += 1;
    return;
  }
  if ((op1 === "(SP)" && op2 === "HL") || (op1 === "HL" && op2 === "(SP)")) {
    ctx.texts.push({ addr: ctx.loc, data: [0xe3] });
    ctx.loc += 1;
    return;
  }
  if ((op1 === "(SP)" && op2 === "IX") || (op1 === "IX" && op2 === "(SP)")) {
    ctx.texts.push({ addr: ctx.loc, data: [0xdd, 0xe3] });
    ctx.loc += 2;
    return;
  }
  if ((op1 === "(SP)" && op2 === "IY") || (op1 === "IY" && op2 === "(SP)")) {
    ctx.texts.push({ addr: ctx.loc, data: [0xfd, 0xe3] });
    ctx.loc += 2;
    return;
  }
  throw new Error(`Unsupported EX form at line ${node.line}`);
}

// --- Misc 単発命令 ---
function encodeMisc(ctx: AsmContext, node: NodeInstr) {
  const opcodeTable: Record<string, number> = {
    NOP: 0x00,
    HALT: 0x76,
    DAA: 0x27,
    CPL: 0x2f,
    SCF: 0x37,
    CCF: 0x3f,
    DI: 0xf3,
    EI: 0xfb,
    RLCA: 0x07,
    RRCA: 0x0f,
    RLA: 0x17,
    RRA: 0x1f,
    EXX: 0xd9,
  };

  const opcode = opcodeTable[node.op];
  if (opcode === undefined) {
    throw new Error(`Unsupported misc instruction ${node.op}`);
  }
  ctx.texts.push({ addr: ctx.loc, data: [opcode] });
  ctx.loc += 1;
}

function encodeCB(ctx: AsmContext, node: NodeInstr) {
  const op = node.op.toUpperCase();
  const args = node.args;

  // --- シフト/ローテート系 (1引数: レジスタ or (HL))
  const rotMap: Record<string, number> = {
    RLC: 0x00,
    RRC: 0x08,
    RL: 0x10,
    RR: 0x18,
    SLA: 0x20,
    SRA: 0x28,
    SLL: 0x30, // undocumented
    SRL: 0x38,
  };

  if (op in rotMap) {
    if (args.length !== 1) throw new Error(`${op} requires 1 operand`);
    const r = args[0];
    const reg = regCode(r);
    ctx.texts.push({ addr: ctx.loc, data: [0xcb, rotMap[op] | reg] });
    ctx.loc += 2;
    return;
  }

  // --- BIT/RES/SET (bit, r)
  if (["BIT", "RES", "SET"].includes(op)) {
    if (args.length !== 2) throw new Error(`${op} requires 2 operands`);
    const bit = parseInt(args[0], 10);
    if (isNaN(bit) || bit < 0 || bit > 7) {
      throw new Error(`${op} bit index out of range: ${args[0]}`);
    }
    const r = args[1];
    const reg = regCode(r);
    const base = op === "BIT" ? 0x40 : op === "RES" ? 0x80 : 0xc0; // SET
    ctx.texts.push({ addr: ctx.loc, data: [0xcb, base | (bit << 3) | reg] });
    ctx.loc += 2;
    return;
  }

  throw new Error(`Unsupported CB instruction ${op} at line ${node.line}`);
}

function encodeIO(ctx: AsmContext, node: NodeInstr) {
  const op = node.op.toUpperCase();
  const args = node.args;

  // --- IN A,(n) ---
  if (
    op === "IN" &&
    args.length === 2 &&
    args[0] === "A" &&
    args[1].startsWith("(")
  ) {
    const portExpr = args[1].slice(1, -1);
    const port = resolveValue(ctx, portExpr);
    if (port === null) {
      ctx.texts.push({ addr: ctx.loc, data: [0xdb, 0x00] });
      ctx.unresolved.push({
        addr: ctx.loc + 1,
        symbol: portExpr,
        size: 1,
      });
    } else {
      if (port < 0 || port > 0xff) {
        throw new Error(`Port number out of range: ${args[1]}`);
      }
      ctx.texts.push({ addr: ctx.loc, data: [0xdb, port & 0xff] });
    }
    ctx.loc += 2;
    return;
  }

  // --- OUT (n),A ---
  if (
    op === "OUT" &&
    args.length === 2 &&
    args[0].startsWith("(") &&
    args[1] === "A"
  ) {
    const portExpr = args[0].slice(1, -1);
    const port = resolveValue(ctx, portExpr);
    if (port === null) {
      ctx.texts.push({ addr: ctx.loc, data: [0xd3, 0x00] });
      ctx.unresolved.push({
        addr: ctx.loc + 1,
        symbol: portExpr,
        size: 1,
      });
    } else {
      if (port < 0 || port > 0xff) {
        throw new Error(`Port number out of range: ${args[0]}`);
      }
      ctx.texts.push({ addr: ctx.loc, data: [0xd3, port & 0xff] });
    }
    ctx.loc += 2;
    return;
  }

  // --- IN r,(C) ---
  if (op === "IN" && args.length === 2 && args[1] === "(C)" && isReg8(args[0])) {
    const code = 0x40 | (regCode(args[0]) << 3);
    ctx.texts.push({ addr: ctx.loc, data: [0xed, code] });
    ctx.loc += 2;
    return;
  }

  // --- OUT (C),r ---
  if (
    op === "OUT" &&
    args.length === 2 &&
    args[0] === "(C)" &&
    isReg8(args[1])
  ) {
    const code = 0x41 | (regCode(args[1]) << 3);
    ctx.texts.push({ addr: ctx.loc, data: [0xed, code] });
    ctx.loc += 2;
    return;
  }

  // --- IN (C) (別名: IN F,(C)) ---
  if (op === "IN" && args.length === 1 && args[0] === "(C)") {
    ctx.texts.push({ addr: ctx.loc, data: [0xed, 0x70] });
    ctx.loc += 2;
    return;
  }

  // --- OUT (C),0 ---
  if (
    op === "OUT" &&
    args.length === 2 &&
    args[0] === "(C)" &&
    args[1] === "0"
  ) {
    ctx.texts.push({ addr: ctx.loc, data: [0xed, 0x71] });
    ctx.loc += 2;
    return;
  }

  throw new Error(`Unsupported IO instruction ${op} ${args.join(",")}`);
}

function encodeED(ctx: AsmContext, node: NodeInstr) {
  const op = node.op.toUpperCase();
  const args = node.args.map((a) => a.toUpperCase());

  // 単純マップ
  const table: Record<string, number> = {
    LDI: 0xa0,
    LDIR: 0xb0,
    LDD: 0xa8,
    LDDR: 0xb8,
    NEG: 0x44,
    RETN: 0x45,
    RETI: 0x4d,
    RRD: 0x67,
    RLD: 0x6f,
  };

  // 単純に決まるやつ
  const key = [op, ...args].join(" ");
  if (table[key]) {
    ctx.texts.push({ addr: ctx.loc, data: [0xed, table[key]] });
    return;
  }

  // IM n
  if (op === "IM") {
    const mode = parseInt(args[0], 10);
    const codes = [0x46, 0x56, 0x5e];
    if (isNaN(mode) || mode < 0 || mode > 2) {
      throw new Error(`Invalid IM mode: ${args[0]}`);
    }
    ctx.texts.push({ addr: ctx.loc, data: [0xed, codes[mode]] });
    return;
  }

  throw new Error(`Unsupported ED instruction ${op} ${args.join(",")}`);
}


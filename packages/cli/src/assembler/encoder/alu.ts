import { AsmContext } from "../context";
import { NodeInstr } from "../parser";
import {
  resolveValue,
  regCode,
  isReg8,
  isImm8,
} from "./utils";

/**
 * 共通: 8bit ALU演算
 */
function encodeALU(
  ctx: AsmContext,
  node: NodeInstr,
  base: number,      // A,r の基本オペコード (下位3bitが r)
  immOpcode: number, // 即値
  hlOpcode: number   // (HL)
) {
  let dst = "A";
  let src: string;

  if (node.args.length === 1) {
    src = node.args[0]; // 短縮形: AND C / CP 1
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

/**
 * ADD
 */
function encodeADD(ctx: AsmContext, node: NodeInstr) {
  const [dst, src] = node.args;
  if (dst === "A") {
    return encodeALU(ctx, node, 0x80, 0xc6, 0x86);
  }
  // 16bit: ADD HL,ss
  if (dst === "HL" && ["BC", "DE", "HL", "SP"].includes(src)) {
    const table: Record<string, number> = { BC: 0x09, DE: 0x19, HL: 0x29, SP: 0x39 };
    ctx.texts.push({ addr: ctx.loc, data: [table[src]] });
    ctx.loc += 1;
    return;
  }
  // 16bit: ADD IX,rr
  if (dst === "IX" && ["BC", "DE", "IX", "SP"].includes(src)) {
    const table: Record<string, number> = { BC: 0x09, DE: 0x19, IX: 0x29, SP: 0x39 };
    ctx.texts.push({ addr: ctx.loc, data: [0xdd, table[src]] });
    ctx.loc += 2;
    return;
  }
  // 16bit: ADD IY,rr
  if (dst === "IY" && ["BC", "DE", "IY", "SP"].includes(src)) {
    const table: Record<string, number> = { BC: 0x09, DE: 0x19, IY: 0x29, SP: 0x39 };
    ctx.texts.push({ addr: ctx.loc, data: [0xfd, table[src]] });
    ctx.loc += 2;
    return;
  }
  throw new Error(`Unsupported ADD form at line ${node.line}`);
}

/**
 * ADC
 */
function encodeADC(ctx: AsmContext, node: NodeInstr) {
  if (node.args[0] === "A") {
    return encodeALU(ctx, node, 0x88, 0xce, 0x8e);
  }
  throw new Error(`Unsupported ADC form at line ${node.line}`);
}

/**
 * SUB
 */
function encodeSUB(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0x90, 0xd6, 0x96);
}

/**
 * SBC
 */
function encodeSBC(ctx: AsmContext, node: NodeInstr) {
  if (node.args[0] === "A") {
    return encodeALU(ctx, node, 0x98, 0xde, 0x9e);
  }
  throw new Error(`Unsupported SBC form at line ${node.line}`);
}

/**
 * AND
 */
function encodeAND(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0xa0, 0xe6, 0xa6);
}

/**
 * OR
 */
function encodeOR(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0xb0, 0xf6, 0xb6);
}

/**
 * XOR
 */
function encodeXOR(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0xa8, 0xee, 0xae);
}

/**
 * CP
 */
function encodeCP(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0xb8, 0xfe, 0xbe);
}

export {
  encodeADD,
  encodeADC,
  encodeSUB,
  encodeSBC,
  encodeAND,
  encodeOR,
  encodeXOR,
  encodeCP,
};

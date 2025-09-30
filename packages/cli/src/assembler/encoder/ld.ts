import { AsmContext } from "../context";
import { NodeInstr } from "../parser";
import {
  resolveValue,
  regCode,
  reg16Code,
  isReg8,
  isReg16,
  isImm16,
  isMemAddress,
  parseIndexAddr,
  resolveExpr8,
  resolveExpr16,
  isIdxReg,
} from "./utils";

import { InstrDef } from "./types";

export const ldInstr: InstrDef[] = [
  // --- LD r,r2 ---
  {
    match: (ctx, [dst, src]) => isReg8(dst) && isReg8(src),
    encode(ctx, [dst, src], node) {
      const opcode = 0x40 | (regCode(dst) << 3) | regCode(src);
      ctx.texts.push({ addr: ctx.loc, data: [opcode] });
      ctx.loc += 1;
    },
  },

  // --- LD r,(HL) ---
  {
    match: (ctx, [dst, src]) => isReg8(dst) && src === "(HL)",
    encode(ctx, [dst], node) {
      const opcode = 0x46 | (regCode(dst) << 3);
      ctx.texts.push({ addr: ctx.loc, data: [opcode] });
      ctx.loc += 1;
    },
  },

  // --- LD (HL),r ---
  {
    match: (ctx, [dst, src]) => dst === "(HL)" && isReg8(src),
    encode(ctx, [, src], node) {
      const opcode = 0x70 | regCode(src);
      ctx.texts.push({ addr: ctx.loc, data: [opcode] });
      ctx.loc += 1;
    },
  },

  // --- LD A,I / LD A,R / LD I,A / LD R,A ---
  {
    match: (ctx, [dst, src]) =>
      (dst === "A" && (src === "I" || src === "R")) ||
      ((dst === "I" || dst === "R") && src === "A"),
    encode(ctx, [dst, src], node) {
      const table: Record<string, number> = {
        "A,I": 0x57, "A,R": 0x5f,
        "I,A": 0x47, "R,A": 0x4f,
      };
      ctx.texts.push({ addr: ctx.loc, data: [0xed, table[`${dst},${src}`]] });
      ctx.loc += 2;
    },
  },

  // --- LD SP,HL ---
  {
    match: (ctx, [dst, src]) => dst === "SP" && src === "HL",
    encode(ctx) {
      ctx.texts.push({ addr: ctx.loc, data: [0xf9] });
      ctx.loc += 1;
    },
  },

  // --- LD r,n ---
  {
    match: (ctx, [dst, src]) => isReg8(dst) && !isReg8(src) && !isMemAddress(src) && !isReg16(src),
    encode(ctx, [dst, src], node) {
      const val = resolveExpr8(ctx, src, node.line);
      ctx.texts.push({
        addr: ctx.loc,
        data: [0x06 | (regCode(dst) << 3), val & 0xff],
      });
      ctx.loc += 2;
    },
  },

  // --- LD rr,nn ---
  {
    match: (ctx, [dst, src]) => isReg16(dst) && !isMemAddress(src) && !isReg8(src),
    encode(ctx, [dst, src], node) {
      const val = resolveExpr16(ctx, src, node.line);
      ctx.texts.push({
        addr: ctx.loc,
        data: [0x01 | (reg16Code(dst) << 4), val & 0xff, (val >> 8) & 0xff],
      });
      ctx.loc += 3;
    },
  },

  // --- LD HL,(nn) ---
  {
    match: (ctx, [dst, src]) => dst === "HL" && isMemAddress(src) && !isIdxReg(src),
    encode(ctx, [, src], node) {
      // ()を除去
      src = src.slice(1, -1);
      const val = resolveExpr16(ctx, src, node.line);
      ctx.texts.push({ addr: ctx.loc, data: [0x2a, val & 0xff, val >> 8] });
      ctx.loc += 3;
    },
  },

  // --- LD (nn),HL ---
  {
    match: (ctx, [dst, src]) => isMemAddress(dst) && !isIdxReg(dst) && src === "HL",
    encode(ctx, [dst], node) {
      // ()を除去
      dst = dst.slice(1, -1);
      const val = resolveExpr16(ctx, dst, node.line);
      ctx.texts.push({ addr: ctx.loc, data: [0x22, val & 0xff, val >> 8] });
      ctx.loc += 3;
    },
  },

  // --- LD A,(nn) ---
  {
    match: (ctx, [dst, src]) => dst === "A" && isMemAddress(src) && !isIdxReg(src),
    encode(ctx, [, src], node) {
      // ()を除去
      src = src.slice(1, -1);
      const val = resolveExpr16(ctx, src, node.line);
      ctx.texts.push({ addr: ctx.loc, data: [0x3a, val & 0xff, val >> 8] });
      ctx.loc += 3;
    },
  },

  // --- LD (nn),A ---
  {
    match: (ctx, [dst, src]) => isMemAddress(dst) && !isIdxReg(dst) && src === "A",
    encode(ctx, [dst], node) {
      // ()を除去
      dst = dst.slice(1, -1);
      const val = resolveExpr16(ctx, dst, node.line);
      ctx.texts.push({ addr: ctx.loc, data: [0x32, val & 0xff, val >> 8] });
      ctx.loc += 3;
    },
  },
];

export function encodeLD(ctx: AsmContext, node: NodeInstr) {
  const [dst, src] = node.args;

  // --- LD r,(IX+d)/(IY+d) ---
  if (isReg8(dst)) {
    const idx = parseIndexAddr(ctx, src);
    if (idx) {
      ctx.texts.push({ addr: ctx.loc, data: [idx.prefix, 0x46 | (regCode(dst) << 3), idx.disp] });
      ctx.loc += 3;
      return;
    }
  }

  // --- LD (IX+d),r ---
  {
    const idx = parseIndexAddr(ctx, dst);
    if (idx && isReg8(src)) {
      ctx.texts.push({ addr: ctx.loc, data: [idx.prefix, 0x70 | regCode(src), idx.disp] });
      ctx.loc += 3;
      return;
    }
  }

  // --- LD IX,nn / LD IY,nn ---
  if ((dst === "IX" || dst === "IY") && isImm16(ctx, src)) {
    const val = resolveValue(ctx, src)!;
    const prefix = dst === "IX" ? 0xdd : 0xfd;
    ctx.texts.push({
      addr: ctx.loc,
      data: [prefix, 0x21, val & 0xff, (val >> 8) & 0xff],
    });
    ctx.loc += 4;
    return;
  }

  throw new Error(`Unsupported LD form at line ${node.line}`);
}

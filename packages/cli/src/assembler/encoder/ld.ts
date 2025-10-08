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
import { OperandKind } from "../operand/operandKind";
import { AssemblerErrorCode } from "../errors";

export const ldInstr: InstrDef[] = [
  // --- LD r,r2 ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.REG8 &&
      src.kind === OperandKind.REG8,
    encode(ctx, [dst, src], node) {
      const opcode = 0x40 | (regCode(dst.raw) << 3) | regCode(src.raw);
      ctx.texts.push({ addr: ctx.loc, data: [opcode], line: node.line });
      ctx.loc += 1;
    },
  },

  // --- LD r,(HL) ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.REG8 &&
      src.kind === OperandKind.REG_IND &&
      src.raw == "(HL)",
    encode(ctx, [dst], node) {
      const opcode = 0x46 | (regCode(dst.raw) << 3);
      ctx.texts.push({ addr: ctx.loc, data: [opcode], line: node.line });
      ctx.loc += 1;
    },
  },

  // --- LD (HL),r ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.REG_IND &&
      dst.raw === "(HL)" &&
      src.kind === OperandKind.REG8,
    encode(ctx, [, src], node) {
      const opcode = 0x70 | regCode(src.raw);
      ctx.texts.push({ addr: ctx.loc, data: [opcode], line: node.line });
      ctx.loc += 1;
    },
  },

  // --- LD A,I / LD A,R / LD I,A / LD R,A ---
  {
    match: (ctx, [dst, src]) =>
      (
        dst.kind === OperandKind.REG8 &&
        dst.raw === 'A' &&
        src.kind === OperandKind.REG_IR
      ) || (
        dst.kind === OperandKind.REG_IR &&
        src.kind === OperandKind.REG8 &&
        src.raw === 'A'
      ),
    encode(ctx, [dst, src], node) {
      const table: Record<string, number> = {
        "A,I": 0x57, "A,R": 0x5f,
        "I,A": 0x47, "R,A": 0x4f,
      };
      ctx.texts.push({ addr: ctx.loc, data: [0xed, table[`${dst.raw},${src.raw}`]], line: node.line });
      ctx.loc += 2;
    },
  },

  // --- LD SP,HL ---
  {
    match: (ctx, [dst, src]) => dst.raw === "SP" && src.raw === "HL",
    encode(ctx, args, node) {
      ctx.texts.push({ addr: ctx.loc, data: [0xf9], line: node.line });
      ctx.loc += 1;
    },
  },

  // --- LD r,n ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.REG8 &&
      (src.kind === OperandKind.IMM || src.kind === OperandKind.EXPR),
    encode(ctx, [dst, src], node) {
      const val = resolveExpr8(ctx, src.raw, node.line);
      ctx.texts.push({
        addr: ctx.loc,
        data: [0x06 | (regCode(dst.raw) << 3), val & 0xff],
        line: node.line,
      });
      ctx.loc += 2;
    },
  },

  // --- LD rr,nn ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.REG16 &&
      (src.kind === OperandKind.IMM || src.kind === OperandKind.EXPR),
    encode(ctx, [dst, src], node) {
      const val = resolveExpr16(ctx, src.raw, node.line);
      ctx.texts.push({
        addr: ctx.loc,
        data: [0x01 | (reg16Code(dst.raw) << 4), val & 0xff, (val >> 8) & 0xff],
        line: node.line,
      });
      ctx.loc += 3;
    },
  },

  // --- LD HL,(nn) ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.REG16 &&
      dst.raw === "HL" &&
      src.kind === OperandKind.MEM,
    encode(ctx, [, src], node) {
      // ()を除去
      const _src = src.raw.slice(1, -1);
      const val = resolveExpr16(ctx, _src, node.line);
      ctx.texts.push({ addr: ctx.loc, data: [0x2a, val & 0xff, val >> 8], line: node.line });
      ctx.loc += 3;
    },
  },

  // --- LD rr,(nn) --- (extended form, for linker relocation)
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.REG16 &&
      src.kind === OperandKind.MEM &&
      !["HL", "IX", "IY"].includes(dst.raw),
    encode(ctx, [dst, src], node) {
      // ()を除去
      const _src = src.raw.slice(1, -1);

      // 外部シンボル or 定数式 → 未解決扱いで16bit読み出し命令を擬似生成
      const val = resolveExpr16(ctx, _src, node.line);

      // Z80には存在しないが、拡張REL生成用としてHL版に合わせる
      // 形式: LD rr,(nn) ≒ prefix(0xED) + code_table[rr] + nn nn
      const regCodeMap: Record<string, number> = {
        BC: 0x4b,
        DE: 0x5b,
        SP: 0x7b,
      };
      const opcode = regCodeMap[dst.raw];
      if (opcode === undefined) {
        ctx.errors.push({
          code: AssemblerErrorCode.InvalidOperand,
          message: `Unsupported LD form: ${dst.raw},(nn)`,
          line: node.line,
        });
        return;
      }

      ctx.texts.push({
        addr: ctx.loc,
        data: [0xed, opcode, val & 0xff, val >> 8],
        line: node.line,
      });
      ctx.loc += 4;
    },
  },

  // --- LD (nn),HL ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.MEM &&
      src.kind === OperandKind.REG16 &&
      src.raw === "HL",
    encode(ctx, [dst], node) {
      // ()を除去
      const _dst = dst.raw.slice(1, -1);
      const val = resolveExpr16(ctx, _dst, node.line);
      ctx.texts.push({ addr: ctx.loc, data: [0x22, val & 0xff, val >> 8], line: node.line });
      ctx.loc += 3;
    },
  },

  // --- LD A,(nn) ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.REG8 &&
      dst.raw === "A" &&
      src.kind === OperandKind.MEM,
    encode(ctx, [dst, src], node) {
      const addr = ctx.loc; // ★ 現在位置を固定
      const _src = src.raw.slice(1, -1);
      const val = resolveExpr16({ ...ctx, loc: addr }, _src, node.line);
      ctx.texts.push({ addr, data: [0x3a, val & 0xff, val >> 8], line: node.line });
      ctx.loc = addr + 3;
    },
  },

  // --- LD (nn),A ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.MEM &&
      src.kind === OperandKind.REG8 &&
      src.raw === "A",
    encode(ctx, [dst, src], node) {
      const addr = ctx.loc; // ★ 現在位置を固定
      const _dst = dst.raw.slice(1, -1);
      const val = resolveExpr16({ ...ctx, loc: addr }, _dst, node.line);
      ctx.texts.push({ addr, data: [0x32, val & 0xff, val >> 8], line: node.line });
      ctx.loc = addr + 3;
    },
  },

  // --- LD r,(IX+d) / LD r,(IY+d) ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.REG8 &&
      src.kind === OperandKind.IDX,
    encode(ctx, [dst, src], node) {
      const prefix = src.raw.startsWith("(IX") ? 0xdd : 0xfd;
      const disp = (src.disp ?? 0) & 0xff;
      const opcode = 0x46 | (regCode(dst.raw) << 3);
      ctx.texts.push({ addr: ctx.loc, data: [prefix, opcode, disp], line: node.line });
      ctx.loc += 3;
    },
  },

  // --- LD (IX+d),r / LD (IY+d),r ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.IDX &&
      src.kind === OperandKind.REG8,
    encode(ctx, [dst, src], node) {
      const prefix = dst.raw.startsWith("(IX") ? 0xdd : 0xfd;
      const disp = (dst.disp ?? 0) & 0xff;
      const opcode = 0x70 | regCode(src.raw);
      ctx.texts.push({ addr: ctx.loc, data: [prefix, opcode, disp], line: node.line });
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
      ctx.texts.push({ addr: ctx.loc, data: [idx.prefix, 0x46 | (regCode(dst) << 3), idx.disp], line: node.line });
      ctx.loc += 3;
      return;
    }
  }

  // --- LD (IX+d),r ---
  {
    const idx = parseIndexAddr(ctx, dst);
    if (idx && isReg8(src)) {
      ctx.texts.push({ addr: ctx.loc, data: [idx.prefix, 0x70 | regCode(src), idx.disp], line: node.line });
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
      line: node.line,
    });
    ctx.loc += 4;
    return;
  }

  throw new Error(`Unsupported LD form at line ${node.line}`);
  // throw new Error(`Unsupported LD form at line ${node.line}: ${JSON.stringify(node)}`);
}

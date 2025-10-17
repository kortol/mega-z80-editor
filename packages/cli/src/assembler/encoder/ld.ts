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
import { emitBytes } from "../codegen/emit";

export const ldInstr: InstrDef[] = [
  // --- LD r,r2 ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.REG8 &&
      src.kind === OperandKind.REG8,
    encode(ctx, [dst, src], node) {
      const opcode = 0x40 | (regCode(dst.raw) << 3) | regCode(src.raw);
      emitBytes(ctx, [opcode], node.pos);
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
      emitBytes(ctx, [opcode], node.pos);
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
      emitBytes(ctx, [opcode], node.pos);
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
      emitBytes(ctx, [0xed, table[`${dst.raw},${src.raw}`]], node.pos);
    },
    estimate: 2,
  },

  // --- LD SP,HL ---
  {
    match: (ctx, [dst, src]) => dst.raw === "SP" && src.raw === "HL",
    encode(ctx, args, node) {
      emitBytes(ctx, [0xf9], node.pos);
    },
  },

  // --- LD r,n ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.REG8 &&
      (src.kind === OperandKind.IMM || src.kind === OperandKind.EXPR),
    encode(ctx, [dst, src], node) {
      const val = resolveExpr8(ctx, src.raw, node.pos);
      emitBytes(ctx, [0x06 | (regCode(dst.raw) << 3), val & 0xff], node.pos);
    },
    estimate: 2,
  },

  // --- LD rr,nn ---
  {
    match: (ctx, [dst, src]) =>
      dst.kind === OperandKind.REG16 &&
      (src.kind === OperandKind.IMM || src.kind === OperandKind.EXPR),
    encode(ctx, [dst, src], node) {
      const val = resolveExpr16(ctx, src.raw, node.pos);
      emitBytes(ctx, [0x01 | (reg16Code(dst.raw) << 4), val & 0xff, (val >> 8) & 0xff], node.pos);
    },
    estimate: 3,
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
      const val = resolveExpr16(ctx, _src, node.pos);
      emitBytes(ctx, [0x2a, val & 0xff, val >> 8], node.pos);
    },
    estimate: 3,
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
      const val = resolveExpr16(ctx, _src, node.pos);

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
          pos: node.pos,
        });
        return;
      }
      emitBytes(ctx, [0xed, opcode, val & 0xff, val >> 8], node.pos);
    },
    estimate: 4,
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
      const val = resolveExpr16(ctx, _dst, node.pos);
      emitBytes(ctx, [0x22, val & 0xff, val >> 8], node.pos);
    },
    estimate: 3,
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
      const val = resolveExpr16({ ...ctx, loc: addr }, _src, node.pos);
      emitBytes(ctx, [0x3a, val & 0xff, val >> 8], node.pos);
    },
    estimate: 3,
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
      const val = resolveExpr16({ ...ctx, loc: addr }, _dst, node.pos);
      emitBytes(ctx, [0x32, val & 0xff, val >> 8], node.pos);
    },
    estimate: 3,
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
      emitBytes(ctx, [prefix, opcode, disp], node.pos);
    },
    estimate: 3,
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
      emitBytes(ctx, [prefix, opcode, disp], node.pos);
    },
    estimate: 3,
  },
];

export function encodeLD(ctx: AsmContext, node: NodeInstr) {
  const [dst, src] = node.args;

  // --- LD r,(IX+d)/(IY+d) ---
  if (isReg8(dst)) {
    const idx = parseIndexAddr(ctx, src);
    if (idx) {
      emitBytes(ctx, [idx.prefix, 0x46 | (regCode(dst) << 3), idx.disp], node.pos)
      return;
    }
  }

  // --- LD (IX+d),r ---
  {
    const idx = parseIndexAddr(ctx, dst);
    if (idx && isReg8(src)) {
      emitBytes(ctx, [idx.prefix, 0x70 | regCode(src), idx.disp], node.pos);
      return;
    }
  }

  // --- LD IX,nn / LD IY,nn ---
  if ((dst === "IX" || dst === "IY") && isImm16(ctx, src)) {
    const val = resolveValue(ctx, src)!;
    const prefix = dst === "IX" ? 0xdd : 0xfd;
    emitBytes(ctx, [prefix, 0x21, val & 0xff, (val >> 8) & 0xff], node.pos);
    return;
  }

  throw new Error(`Unsupported LD form at line ${node.pos.line}`);
  // throw new Error(`Unsupported LD form at line ${node.pos.line}: ${JSON.stringify(node)}`);
}

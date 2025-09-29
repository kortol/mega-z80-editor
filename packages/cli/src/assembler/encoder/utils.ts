/**
 * utils.ts - Z80 assembler encoding utilities
 *
 * このファイルは encoder 各モジュール（LD/ALU/JP など）で共通利用される
 * 判定・変換系ユーティリティをまとめたもの。
 *
 * ⚠️ 注意：
 *   - isImm8 / isImm16 / isAbs16 / isMemAddress を混同しないこと
 *   - 順序によって LD A,(1234H) が誤って LD A,1234 と解釈される可能性があるため、
 *     encode 側で必ず (HL)/(IX+d)/(IY+d) → (nn) → imm8 の順に判定すること
 */

import { AsmContext } from "../context";
import { parseNumber } from "../tokenizer";

/* -------------------- 値解決 -------------------- */

/** 式/シンボル/数値リテラルを数値に変換。未解決なら null */
export function resolveValue(ctx: AsmContext, expr: string): number | null {
  if (expr === "$") return ctx.loc;
  try {
    return parseNumber(expr);
  } catch {
    return null;
  }
}

/* -------------------- レジスタ -------------------- */

/** 8bit レジスタかどうか (A,B,C,D,E,H,L) */
export function isReg8(r: string): boolean {
  return ["A", "B", "C", "D", "E", "H", "L"].includes(r.toUpperCase());
}

/** 16bit レジスタかどうか (BC,DE,HL,SP) */
export function isReg16(r: string): boolean {
  return ["BC", "DE", "HL", "SP"].includes(r.toUpperCase());
}

/** 8bit レジスタコード (for opcode encoding) */
export function regCode(r: string): number {
  const table: Record<string, number> = {
    B: 0,
    C: 1,
    D: 2,
    E: 3,
    H: 4,
    L: 5,
    "(HL)": 6,
    A: 7,
  };
  if (!(r in table)) throw new Error(`Invalid 8bit register: ${r}`);
  return table[r];
}

/** 16bit レジスタコード (for opcode encoding) */
export function reg16Code(r: string): number {
  const table: Record<string, number> = { BC: 0, DE: 1, HL: 2, SP: 3 };
  if (!(r in table)) throw new Error(`Invalid 16bit register: ${r}`);
  return table[r];
}

/* -------------------- 即値 -------------------- */

/** 8bit 即値かどうか */
export function isImm8(ctx: AsmContext, v: string): boolean {
  const val = resolveValue(ctx, v);
  return val !== null && val >= 0 && val <= 0xff;
}

/** 16bit 即値かどうか */
export function isImm16(ctx: AsmContext, v: string): boolean {
  const val = resolveValue(ctx, v);
  return val !== null && val >= 0 && val <= 0xffff;
}

/* -------------------- アドレス -------------------- */

/** 裸の 16bit アドレス（括弧なし数値/シンボル） */
export function isAbs16(v: string): boolean {
  return (
    /^\d+$/.test(v) || // 10進
    /^[0-9A-F]+H$/i.test(v) || // 16進 (末尾H)
    /^0x[0-9A-F]+$/i.test(v) || // 16進 (0x)
    /^%[01]+$/.test(v) // 2進
  );
}

/** 括弧付きアドレス (例: (1234H), (LABEL)) */
export function isMemAddress(v: string): boolean {
  return /^\(.*\)$/.test(v);
}

/**
 * (IX+d) / (IY+d) の場合に prefix と disp を返す
 * 例: (IX+01H) → { prefix: 0xDD, disp: 0x01 }
 */
export function parseIndexAddr(
  ctx: AsmContext,
  v: string
): { prefix: number; disp: number } | null {
  const m = /^\((IX|IY)\+(.+)\)$/i.exec(v);
  if (!m) return null;
  const prefix = m[1].toUpperCase() === "IX" ? 0xdd : 0xfd;
  const val = resolveValue(ctx, m[2]);
  if (val === null) throw new Error(`Unresolved displacement: ${m[2]}`);
  if (val < -128 || val > 127)
    throw new Error(`Index displacement out of range: ${val}`);
  return { prefix, disp: val & 0xff };
}

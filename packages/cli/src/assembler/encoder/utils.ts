// packages\cli\src\assembler\encoder\utils.ts
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
import { AssemblerErrorCode } from "../errors";
import { evalExpr } from "../expr/eval";
import { parseExpr } from "../expr/parserExpr";
import { parseNumber, tokenize } from "../tokenizer";

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
export function isMemAddress(s: string): boolean {
  return /^\(.+\)$/.test(s.trim()); // ()で囲まれていればメモリ参照
}

export function isIdxReg(s: string): boolean {
  const upperCase = s.toUpperCase();
  return upperCase.includes("IX") || upperCase.includes("IY");
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

export function resolveExpr8(
  ctx: AsmContext,
  expr: string,
  line: number,
  strict = false,
  rejectReloc = false,
  relative = false
): number {
  const prevErrCount = ctx.errors.length;
  const tokens = tokenize(expr).filter(t => t.kind !== "eol");
  const e = parseExpr(tokens);
  const res = evalExpr(e, { ...ctx, pass: 1, visiting: new Set(), externs: ctx.externs });

  // --- Reloc値 ---
  if (res.kind === "Reloc") {
    if (rejectReloc) {
      throw new Error(`Relocatable expression '${expr}' not allowed here (line ${line})`);
    }

    const relocEntry: any = {
      addr: ctx.loc + 1,
      symbol: res.sym,
      size: 1,
    };
    if (res.addend && res.addend !== 0) relocEntry.addend = res.addend;
    if (relative) relocEntry.relative = true;

    if (!(ctx as any).relocs) (ctx as any).relocs = [];
    (ctx as any).relocs.push(relocEntry);
    ctx.unresolved.push(relocEntry);
    return 0;
  }

  const newErrors = ctx.errors.slice(prevErrCount);
  if (newErrors.length > 0) {
    const err = ctx.errors[ctx.errors.length - 1];
    if (strict) {
      throw new Error(`Expression error at line ${line}: ${err.message ?? err.code}`);
    }
    ctx.errors.push({
      code: AssemblerErrorCode.ExprNotConstant,
      message: `Expression error at line ${line}`,
      line,
    });
    return 0;
  }

  // --- Const値 ---
  if (res.kind === "Const") {
    if (res.value < -128 || res.value > 255) {
      if (strict) {
        throw new Error(`8bit immediate out of range: ${res.value} (line ${line})`);
      }
      ctx.errors.push({
        code: AssemblerErrorCode.ExprNotConstant,
        message: `8bit immediate out of range at line ${line}`,
        line,
      });
      return 0;
    }
    return res.value & 0xFF;
  }

  throw new Error(`Unexpected evalExpr result at line ${line}`);
}


export function resolveExpr16(ctx: AsmContext, expr: string, line: number, strict = false, rejectReloc = false): number {
  const prevErrCount = ctx.errors.length;
  const tokens = tokenize(expr).filter(t => t.kind !== "eol");
  const e = parseExpr(tokens);
  const res = evalExpr(e, { ...ctx, pass: 1, visiting: new Set(), externs: ctx.externs });
  // console.log("evalExpr");

  // 🧩 Relocatable の場合は newErrors よりも優先的に処理する
  // console.log("Reloc");
  // ---- Reloc値 ----
  if (res.kind === "Reloc") {
    if (rejectReloc) {
      throw new Error(`Relocatable expression '${expr}' not allowed here (line ${line})`);
    }
    const relocEntry = {
      addr: ctx.loc + 1,
      symbol: res.sym,
      addend: Number(res.addend ?? 0),
      size: 2,
    };

    // 🔸 新: Rレコード用に ctx.relocs にも記録
    if (!(ctx as any).relocs) (ctx as any).relocs = [];
    (ctx as any).relocs.push(relocEntry);

    // 従来の未解決リスト（後方互換）
    ctx.unresolved.push(relocEntry);
    // console.log("Reloc");
    return 0;
  }

  const newErrors = ctx.errors.slice(prevErrCount);
  if (newErrors.length > 0) {
    const err = ctx.errors[ctx.errors.length - 1];
    // console.log("newErrors");
    if (strict) {
      throw new Error(`Expression error at line ${line}: ${err.message ?? err.code}`);
    }
    ctx.errors.push({
      code: AssemblerErrorCode.ExprNotConstant,
      message: `Expression error at line ${line}`,
      line,
    });
    // console.log("ExprNotConstant");
    return 0;
  }

  // console.log("Const");
  // ---- Const値 ----
  if (res.kind === "Const") {
    if (res.value < -32768 || res.value > 0xFFFF) {
      if (strict) {
        throw new Error(`16bit immediate out of range: ${res.value} (line ${line})`);
      }
      ctx.errors.push({
        code: AssemblerErrorCode.ExprNotConstant,
        message: `16bit immediate out of range at line ${line}`,
        line,
      });
      return 0;
    }
    return res.value & 0xFFFF;
  }

  // console.log("Unexpected");
  // ---- 想定外 ----
  throw new Error(`Unexpected evalExpr result at line ${line}`);
}

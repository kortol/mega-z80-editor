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
import { AsmContext, SourcePos } from "../context";
/** 式/シンボル/数値リテラルを数値に変換。未解決なら null */
export declare function resolveValue(ctx: AsmContext, expr: string): number | null;
/** 8bit レジスタかどうか (A,B,C,D,E,H,L) */
export declare function isReg8(r: string): boolean;
export declare function reg8Info(r: string): {
    code: number;
    prefix?: number;
} | null;
export declare function reg8Prefix(r: string): number | undefined;
/** 16bit レジスタかどうか (BC,DE,HL,SP) */
export declare function isReg16(r: string): boolean;
/** 8bit レジスタコード (for opcode encoding) */
export declare function regCode(r: string): number;
/** 16bit レジスタコード (for opcode encoding) */
export declare function reg16Code(r: string): number;
/** 8bit 即値かどうか */
export declare function isImm8(ctx: AsmContext, v: string): boolean;
/** 16bit 即値かどうか */
export declare function isImm16(ctx: AsmContext, v: string): boolean;
/** 裸の 16bit アドレス（括弧なし数値/シンボル） */
export declare function isAbs16(v: string): boolean;
/** 括弧付きアドレス (例: (1234H), (LABEL)) */
export declare function isMemAddress(s: string): boolean;
export declare function isIdxReg(s: string): boolean;
/**
 * (IX+d) / (IY+d) の場合に prefix と disp を返す
 * 例: (IX+01H) → { prefix: 0xDD, disp: 0x01 }
 */
export declare function parseIndexAddr(ctx: AsmContext, v: string): {
    prefix: number;
    disp: number;
} | null;
export declare function resolveExpr8(ctx: AsmContext, expr: string, pos: SourcePos, strict?: boolean, rejectReloc?: boolean, relative?: boolean, relocOffset?: number): number;
export declare function resolveExpr16(ctx: AsmContext, expr: string, pos: SourcePos, strict?: boolean, rejectReloc?: boolean, relocOffset?: number, recordConstLabelReloc?: boolean): number;

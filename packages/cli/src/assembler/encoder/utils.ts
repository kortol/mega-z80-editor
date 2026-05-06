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

import { AsmContext, SourcePos, UnresolvedEntry } from "../context";
import { AssemblerErrorCode, makeWarning } from "../errors";
import { evalExpr } from "../expr/eval";
import { parseExpr } from "../expr/parserExpr";
import { NodeInstr } from "../node";
import { parseNumber, tokenize } from "../tokenizer";

function resolveLocalSymbolName(ctx: AsmContext, name: string): string {
  let resolved = name;
  if (resolved.startsWith(".")) {
    const base = ctx.currentGlobalLabel;
    if (base) resolved = `${base}${resolved}`;
  }
  return ctx.caseInsensitive ? resolved.toUpperCase() : resolved;
}

type RelocOrConst = { kind: "Reloc"; sym: string; addend: number } | { kind: "Const"; value: number } | null;

function extractRelocOrConst(ctx: AsmContext, ast: any): RelocOrConst {
  if (!ast || typeof ast !== "object") return null;
  switch (ast.kind) {
    case "Const":
      return { kind: "Const", value: Number(ast.value ?? 0) };
    case "Symbol": {
      const nameRaw = String(ast.name ?? "");
      if (nameRaw === "$") return { kind: "Const", value: ctx.loc };
      const name = resolveLocalSymbolName(ctx, nameRaw);
      if (ctx.externs.has(name)) return { kind: "Reloc", sym: name, addend: 0 };
      const sym = ctx.symbols.get(name) as any;
      if (!sym) return null;
      if (typeof sym === "number") return { kind: "Const", value: sym };
      if (sym.type === "CONST") return { kind: "Const", value: Number(sym.value ?? 0) };
      if (sym.type === "EXTERN") return { kind: "Reloc", sym: name, addend: 0 };
      if (sym.type === "LABEL") {
        const sec = ctx.sections?.get(sym.sectionId ?? 0);
        if (sec?.kind === "ASEG") return { kind: "Const", value: Number(sym.value ?? 0) };
        return { kind: "Reloc", sym: name, addend: 0 };
      }
      return null;
    }
    case "Unary": {
      const v = extractRelocOrConst(ctx, ast.expr);
      if (!v) return null;
      if (v.kind === "Reloc") return null;
      const op = String(ast.op ?? "+");
      if (op === "+") return { kind: "Const", value: +v.value };
      if (op === "-") return { kind: "Const", value: -v.value };
      if (op === "~") return { kind: "Const", value: ~v.value };
      return null;
    }
    case "Binary": {
      const L = extractRelocOrConst(ctx, ast.left);
      const R = extractRelocOrConst(ctx, ast.right);
      if (!L || !R) return null;
      const op = String(ast.op ?? "");
      if (L.kind === "Const" && R.kind === "Const") {
        if (op === "+") return { kind: "Const", value: L.value + R.value };
        if (op === "-") return { kind: "Const", value: L.value - R.value };
        return null;
      }
      if (L.kind === "Reloc" && R.kind === "Const") {
        if (op === "+") return { kind: "Reloc", sym: L.sym, addend: L.addend + R.value };
        if (op === "-") return { kind: "Reloc", sym: L.sym, addend: L.addend - R.value };
        return null;
      }
      if (L.kind === "Const" && R.kind === "Reloc") {
        if (op === "+") return { kind: "Reloc", sym: R.sym, addend: R.addend + L.value };
        return null;
      }
      return null;
    }
    default:
      return null;
  }
}

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

export function reg8Info(r: string): { code: number; prefix?: number } | null {
  const upper = r.toUpperCase();
  const base: Record<string, number> = {
    B: 0,
    C: 1,
    D: 2,
    E: 3,
    H: 4,
    L: 5,
    A: 7,
  };
  if (upper in base) return { code: base[upper] };
  if (upper === "IXH") return { code: 4, prefix: 0xdd };
  if (upper === "IXL") return { code: 5, prefix: 0xdd };
  if (upper === "IYH") return { code: 4, prefix: 0xfd };
  if (upper === "IYL") return { code: 5, prefix: 0xfd };
  return null;
}

export function reg8Prefix(r: string): number | undefined {
  return reg8Info(r)?.prefix;
}

/** 16bit レジスタかどうか (BC,DE,HL,SP) */
export function isReg16(r: string): boolean {
  return ["BC", "DE", "HL", "SP"].includes(r.toUpperCase());
}

/** 8bit レジスタコード (for opcode encoding) */
export function regCode(r: string): number {
  const key = r.toUpperCase();
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
  if (!(key in table)) throw new Error(`Invalid 8bit register: ${r}`);
  return table[key];
}

/** 16bit レジスタコード (for opcode encoding) */
export function reg16Code(r: string): number {
  const key = r.toUpperCase();
  const table: Record<string, number> = { BC: 0, DE: 1, HL: 2, SP: 3 };
  if (!(key in table)) throw new Error(`Invalid 16bit register: ${r}`);
  return table[key];
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
  const m = /^\((IX|IY)(?:([+-])(.+))?\)$/i.exec(v);
  if (!m) return null;
  const prefix = m[1].toUpperCase() === "IX" ? 0xdd : 0xfd;
  let disp = 0;
  if (m[2] && m[3]) {
    const val = resolveValue(ctx, m[3]);
    if (val === null) throw new Error(`Unresolved displacement: ${m[3]}`);
    const signed = m[2] === "-" ? -val : val;
    if (signed < -128 || signed > 127)
      throw new Error(`Index displacement out of range: ${signed}`);
    disp = signed & 0xff;
  }
  return { prefix, disp };
}

export function resolveExpr8(
  ctx: AsmContext,
  expr: string,
  pos: SourcePos,
  strict?: boolean,
  rejectReloc = false,
  relative = false,
  relocOffset = 1
): number {
  const effectiveStrict = strict ?? ctx.options.strictOverflow ?? false;
  const prevErrCount = ctx.errors.length;
  const tokens = tokenize(ctx, expr).filter(t => t.kind !== "eol");
  const e = parseExpr(tokens);
  const res = evalExpr(e, { ...ctx, pass: 1, visiting: new Set(), externs: ctx.externs });

  // --- Reloc値 ---
  if (res.kind === "Reloc") {
    if (rejectReloc) {
      throw new Error(`Relocatable expression '${expr}' not allowed here (line ${pos.line})`);
    }

    // --- pass2 のときだけ記録 ---
    if (ctx.phase === "emit") {
      const sec = ctx.sections?.get(ctx.currentSection ?? 0);
      const useRel = (ctx.output?.relVersion ?? ctx.options?.relVersion ?? 1) === 2;
      const base = useRel && sec && sec.kind !== "ASEG" ? (sec.org ?? 0) : 0;
      const addr = useRel ? (ctx.loc - base) + relocOffset : ctx.loc + relocOffset;
      const relocEntry: any = {
        addr,
        symbol: res.sym,
        size: 1,
        sectionId: ctx.currentSection ?? 0,
      };
      if (res.addend && res.addend !== 0) relocEntry.addend = res.addend;
      if (relative) relocEntry.relative = true;

      if (!(ctx as any).relocs) (ctx as any).relocs = [];
      (ctx as any).relocs.push(relocEntry);
      ctx.unresolved.push(relocEntry);
    }
    return 0;
  }

  const newErrors = ctx.errors.slice(prevErrCount);
  if (newErrors.length > 0) {
    const err = ctx.errors[ctx.errors.length - 1];
    if (effectiveStrict) {
      throw new Error(`Expression error at line ${pos.line}: ${err.message ?? err.code}`);
    }
    ctx.errors.push({
      code: AssemblerErrorCode.ExprNotConstant,
      message: `Expression error at line ${pos.line}`,
      pos,
    });
    return 0;
  }

  // --- Const値 ---
  if (res.kind === "Const") {
    if (res.value < -128 || res.value > 255) {
      if (effectiveStrict) {
        throw new Error(`8bit immediate out of range: ${res.value} (line ${pos.line})`);
      }
      ctx.warnings.push(
        makeWarning(
          AssemblerErrorCode.ExprOverflow,
          `8bit immediate out of range at line ${pos.line}`,
          { pos }
        )
      );
      return res.value & 0xff;
    }
    return res.value & 0xFF;
  }

  throw new Error(`Unexpected evalExpr result at line ${pos.line}`);
}


export function resolveExpr16(
  ctx: AsmContext,
  expr: string,
  pos: SourcePos,
  strict?: boolean,
  rejectReloc = false,
  relocOffset = 1,
  recordConstLabelReloc = true
): number {
  const effectiveStrict = strict ?? ctx.options.strictOverflow ?? false;
  const prevErrCount = ctx.errors.length;
  const tokens = tokenize(ctx, expr).filter(t => t.kind !== "eol");
  const e = parseExpr(tokens);
  const res = evalExpr(e, { ...ctx, pass: 1, visiting: new Set(), externs: ctx.externs });
  // console.log("evalExpr");

  // 🧩 Relocatable の場合は newErrors よりも優先的に処理する
  // console.log("Reloc");
  // ---- Reloc値 ----
  if (res.kind === "Reloc") {
    if (rejectReloc) {
      throw new Error(`Relocatable expression '${expr}' not allowed here (line ${pos.line})`);
    }
    // --- pass2 のときだけ記録 ---
    if (ctx.phase === "emit") {
      const sec = ctx.sections?.get(ctx.currentSection ?? 0);
      const useRel = (ctx.output?.relVersion ?? ctx.options?.relVersion ?? 1) === 2;
      const base = useRel && sec && sec.kind !== "ASEG" ? (sec.org ?? 0) : 0;
      const addr = useRel ? (ctx.loc - base) + relocOffset : ctx.loc + relocOffset;
      const relocEntry: UnresolvedEntry = {
        addr,
        symbol: res.sym,
        addend: Number(res.addend ?? 0),
        size: 2 as 1 | 2 | 4,
        sectionId: ctx.currentSection ?? 0,
        requester: {                    // ✅ 追加！
          op: "ENCODER",                // 呼び出し元フェーズ
          phase: "assemble",
          pos,
        },
      };

      // 🔸 新: Rレコード用に ctx.relocs にも記録
      if (!(ctx as any).relocs) (ctx as any).relocs = [];
      (ctx as any).relocs.push(relocEntry);

      // 従来の未解決リスト（後方互換）
      ctx.unresolved.push(relocEntry);
      // console.log("Reloc");
    }
    return 0;
  }

  const newErrors = ctx.errors.slice(prevErrCount);
  if (newErrors.length > 0) {
    const err = ctx.errors[ctx.errors.length - 1];
    // console.log("newErrors");
    if (effectiveStrict) {
      throw new Error(`Expression error at line ${pos.line}: ${err.message ?? err.code}`);
    }
    ctx.errors.push({
      code: AssemblerErrorCode.ExprNotConstant,
      message: `Expression error at line ${pos.line}`,
      pos,
    });
    // console.log("ExprNotConstant");
    return 0;
  }

  // console.log("Const");
  // ---- Const値 ----
  if (res.kind === "Const") {
    // LABEL由来の定数式（例: LD HL,TABLE）にも fixup を積む。
    // これによりリンク時にセクション配置基準で再配置される。
    if (recordConstLabelReloc && !rejectReloc && ctx.phase === "emit") {
      const rr = extractRelocOrConst(ctx, e);
      if (rr && rr.kind === "Reloc") {
        const sec = ctx.sections?.get(ctx.currentSection ?? 0);
        const useRel = (ctx.output?.relVersion ?? ctx.options?.relVersion ?? 1) === 2;
        const base = useRel && sec && sec.kind !== "ASEG" ? (sec.org ?? 0) : 0;
        const addr = useRel ? (ctx.loc - base) + relocOffset : ctx.loc + relocOffset;
        const relocEntry: UnresolvedEntry = {
          addr,
          symbol: rr.sym,
          addend: Number(rr.addend ?? 0),
          size: 2 as 1 | 2 | 4,
          sectionId: ctx.currentSection ?? 0,
          requester: {
            op: "ENCODER",
            phase: "assemble",
            pos,
          },
        };
        if (!(ctx as any).relocs) (ctx as any).relocs = [];
        (ctx as any).relocs.push(relocEntry);
        ctx.unresolved.push(relocEntry);
      }
    }

    if (res.value < -32768 || res.value > 0xFFFF) {
      if (effectiveStrict) {
        throw new Error(`16bit immediate out of range: ${res.value} (line ${pos.line})`);
      }
      ctx.warnings.push(
        makeWarning(
          AssemblerErrorCode.ExprOverflow,
          `16bit immediate out of range at line ${pos.line}`,
          { pos }
        )
      );
      return res.value & 0xffff;
    }
    return res.value & 0xFFFF;
  }

  // console.log("Unexpected");
  // ---- 想定外 ----
  throw new Error(`Unexpected evalExpr result at line ${pos.line}`);
}



import { AsmContext, canon, defineSymbol, resolveLocalLabel } from "../context";
import { NodePseudo } from "../node";
import { makeError, AssemblerErrorCode, makeWarning } from "../errors";
import { tokenize } from "../tokenizer";
import { parseExpr } from "../expr/parserExpr";
import { evalExpr, makeEvalCtx } from "../expr/eval";

type RelocExpr =
  | { kind: "Const"; value: number }
  | { kind: "Reloc"; sectionId: number; addend: number };

function classifyRelocExpr(ctx: AsmContext, ast: any, constValue: number): RelocExpr | null {
  if (!ast || typeof ast !== "object") return null;
  switch (ast.kind) {
    case "Const":
      return { kind: "Const", value: Number(ast.value ?? 0) };
    case "Symbol": {
      const raw = String(ast.name ?? "");
      if (raw === "$") {
        return { kind: "Reloc", sectionId: ctx.currentSection ?? 0, addend: 0 };
      }
      const name = canon(resolveLocalLabel(ctx, raw), ctx);
      const sym = ctx.symbols.get(name);
      if (!sym || typeof sym === "number") return null;
      if (sym.type === "EXTERN") return null;
      if (sym.type === "CONST") return { kind: "Const", value: Number(sym.value ?? 0) };
      const sec = ctx.sections?.get(sym.sectionId ?? 0);
      if (sec?.kind === "ASEG") return { kind: "Const", value: Number(sym.value ?? 0) };
      return { kind: "Reloc", sectionId: sym.sectionId ?? 0, addend: 0 };
    }
    case "Unary": {
      const v = classifyRelocExpr(ctx, ast.expr, constValue);
      if (!v) return null;
      const op = String(ast.op ?? "+");
      if (v.kind === "Reloc") return null;
      if (op === "+") return { kind: "Const", value: +v.value };
      if (op === "-") return { kind: "Const", value: -v.value };
      if (op === "~") return { kind: "Const", value: ~v.value };
      return null;
    }
    case "Binary": {
      const L = classifyRelocExpr(ctx, ast.left, constValue);
      const R = classifyRelocExpr(ctx, ast.right, constValue);
      if (!L || !R) return null;
      const op = String(ast.op ?? "");
      if (L.kind === "Const" && R.kind === "Const") {
        if (op === "+") return { kind: "Const", value: L.value + R.value };
        if (op === "-") return { kind: "Const", value: L.value - R.value };
        if (op === "*") return { kind: "Const", value: L.value * R.value };
        if (op === "/") return { kind: "Const", value: (R.value === 0 ? 0 : Math.trunc(L.value / R.value)) };
        if (op === "%") return { kind: "Const", value: (R.value === 0 ? 0 : L.value % R.value) };
        if (op === "&") return { kind: "Const", value: L.value & R.value };
        if (op === "|") return { kind: "Const", value: L.value | R.value };
        if (op === "^") return { kind: "Const", value: L.value ^ R.value };
        if (op === "<<") return { kind: "Const", value: L.value << R.value };
        if (op === ">>") return { kind: "Const", value: L.value >> R.value };
        return null;
      }
      if (L.kind === "Reloc" && R.kind === "Const") {
        if (op === "+") return { kind: "Reloc", sectionId: L.sectionId, addend: L.addend + R.value };
        if (op === "-") return { kind: "Reloc", sectionId: L.sectionId, addend: L.addend - R.value };
        return null;
      }
      if (L.kind === "Const" && R.kind === "Reloc") {
        if (op === "+") return { kind: "Reloc", sectionId: R.sectionId, addend: R.addend + L.value };
        return null;
      }
      if (L.kind === "Reloc" && R.kind === "Reloc") {
        if (op === "-" && L.sectionId === R.sectionId) {
          return { kind: "Const", value: constValue };
        }
        return null;
      }
      return null;
    }
    default:
      return null;
  }
}

export function handleEQU(ctx: AsmContext, node: NodePseudo) {
  if (ctx.phase !== "analyze" && ctx.phase !== "emit") return;
  if (node.args.length !== 1) {
    throw new Error(`EQU requires two arguments at line ${node.pos.line}`);
  }

  // PseudoArg形式: { key: "FOO", value: "10" }
  const key = node.args[0].key ?? "";
  const valStr = node.args[0].value ?? "";

  if (!key) {
    throw new Error(`EQU missing symbol name at line ${node.pos.line}`);
  }
  // 大文字小文字処理
  let sym = ctx.caseInsensitive ? key.toUpperCase() : key;
  // シンボル長制限
  if (sym.length > ctx.modeSymLen) {
    const truncated = sym.substring(0, ctx.modeSymLen);
    ctx.warnings.push(
      makeWarning(
        AssemblerErrorCode.ExprOutRange,
        `Symbol '${sym}' truncated to '${truncated}'`,
        { pos: ctx.currentPos }
      )
    );
    sym = truncated; // ← 登録キーを更新
  }
  // 即値を評価（EQUは式を許可）
  const tokens = tokenize(ctx, valStr).filter((t) => t.kind !== "eol");
  const e = parseExpr(tokens);
  const evalCtx = makeEvalCtx(ctx);
  const res = evalExpr(e, evalCtx);
  if (res.kind !== "Const") {
    ctx.errors.push(
      makeError(
        AssemblerErrorCode.ExprNotConstant,
        `EQU value must be constant at line ${node.pos.line}`
      )
    );
    throw new Error(`EQU value must be constant at line ${node.pos.line}`);
  }
  const val = res.value;

  const relocClass = classifyRelocExpr(ctx, e as any, val);
  // 既存シンボルとの衝突確認（analyze時のみ厳格）
  if (ctx.phase === "analyze" && ctx.symbols.has(sym)) {
    const prev = ctx.symbols.get(sym);
    if (prev && (prev as any).value !== val) {
      ctx.errors.push(
        makeError(
          AssemblerErrorCode.RedefSymbol,
          `Redefinition of symbol '${sym}' at line ${node.pos.line}`
        )
      );
      throw new Error(`Symbol '${sym}' redefined at line ${node.pos.line}`);
    }
  }

  if (relocClass?.kind === "Reloc") {
    ctx.symbols.set(sym, {
      value: val,
      sectionId: relocClass.sectionId,
      type: "LABEL",
      pos: node.pos,
    });
    return;
  }

  defineSymbol(ctx, sym, val, "CONST", node.pos);
}

export function handleSYMLEN(ctx: AsmContext, node: NodePseudo) {
  const arg = node.args?.[0]?.value ?? "32";
  ctx.modeSymLen = parseInt(arg, 10);
}

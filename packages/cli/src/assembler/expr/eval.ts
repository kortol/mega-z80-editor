import { EvalResult, Expr } from "./types";
import { AssemblerErrorCode, makeError } from "../errors";
import { AsmContext } from "../context";

export interface EvalContext {
  symbols: Map<string, Expr | number>; // 定義済みシンボル
  externs: Set<string>; // EXTERN 宣言済みシンボル
  pass: 1 | 2; // 現在のパス番号
  errors: any[]; // 発生したエラーを蓄積
  visiting: Set<string>; // 現在評価中のシンボル
}

export function makeEvalCtx(ac: AsmContext): EvalContext {
  return {
    symbols: ac.symbols,
    externs: new Set(ac.unresolved.map((e) => e.symbol)),
    pass: 1,
    errors: ac.errors,
    visiting: new Set<string>(),
  };
} 

// evalExpr: 式を評価し Const か Reloc を返す
export function evalExpr(expr: Expr, ctx: EvalContext): EvalResult {
  switch (expr.kind) {
    case "Const":
      return { kind: "Const", value: expr.value };

    case "Symbol":
      if (ctx.symbols.has(expr.name)) {
        const val = ctx.symbols.get(expr.name)!;
        if (typeof val === "number") {
          return { kind: "Const", value: val };
        } else {
          // Expr の場合は再帰的に評価
          if (ctx.visiting.has(expr.name)) {
            ctx.errors.push(
              makeError(
                AssemblerErrorCode.ExprCircularRef,
                `Circular reference detected: ${expr.name}`
              )
            );
            return { kind: "Const", value: 0 };
          }
          ctx.visiting.add(expr.name);
          const res = evalExpr(val, ctx);
          ctx.visiting.delete(expr.name);
          return res;
        }
      }
      if (ctx.externs.has(expr.name)) {
        return { kind: "Reloc", sym: expr.name, addend: 0 };
      }
      ctx.errors.push(
        makeError(
          AssemblerErrorCode.ExprUndefinedSymbol,
          `Undefined symbol: ${expr.name}`
        )
      );
      return { kind: "Reloc", sym: expr.name, addend: 0 };

    case "Unary":
      const valU = evalExpr(expr.expr, ctx);
      if (valU.kind === "Const") {
        return {
          kind: "Const",
          value: expr.op === "-" ? -valU.value : +valU.value,
        };
      }
      return valU; // Relocはそのまま伝播

    case "Binary":
      const l: EvalResult = evalExpr(expr.left, ctx);
      const r: EvalResult = evalExpr(expr.right, ctx);

      if (l.kind === "Const" && r.kind === "Const") {
        return {
          kind: "Const",
          value: evalBinary(expr.op, l.value, r.value, ctx),
        };
      }

      // extern ± const
      if (l.kind === "Reloc" && r.kind === "Const") {
        return {
          kind: "Reloc",
          sym: l.sym,
          addend: applyAddend(expr.op, r.value, ctx),
        };
      }

      // const + extern
      if (l.kind === "Const" && r.kind === "Reloc" && expr.op === "+") {
        return { kind: "Reloc", sym: r.sym, addend: l.value };
      }

      // const - extern → A2102
      if (l.kind === "Const" && r.kind === "Reloc" && expr.op === "-") {
        ctx.errors.push(
          makeError(
            AssemblerErrorCode.ExprConstMinusExtern,
            "const - extern is not supported"
          )
        );
        return { kind: "Const", value: 0 };
      }

      // extern ± extern → A2101
      ctx.errors.push(
        makeError(
          AssemblerErrorCode.ExprExternArithmetic,
          `Invalid external symbol arithmetic`
        )
      );
      return { kind: "Const", value: 0 };
  }
}

function evalBinary(
  op: string,
  left: number,
  right: number,
  ctx: EvalContext
): number {
  let result: number;

  switch (op) {
    case "+":
      result = left + right;
      break;
    case "-":
      result = left - right;
      break;
    case "*":
      result = left * right;
      break;
    case "/":
      if (right === 0) {
        ctx.errors.push(
          makeError(AssemblerErrorCode.ExprDivideByZero, "Division by zero")
        );
        return 0;
      }
      result = Math.trunc(left / right); // 0方向へ丸め
      break;
    case "%":
      if (right === 0) {
        ctx.errors.push(
          makeError(AssemblerErrorCode.ExprDivideByZero, "Modulo by zero")
        );
        return 0;
      }
      result = left % right;
      break;
    default:
      result = 0;
  }

  // 🚨 NaN / Infinity 検出
  if (!Number.isFinite(result)) {
    ctx.errors.push(
      makeError(
        AssemblerErrorCode.ExprNaN,
        `Expression evaluated to NaN (op=${op})`
      )
    );
    return 0;
  }
  return result;
}

function applyAddend(op: string, value: number, ctx: EvalContext): number {
  if (op === "+") return value;
  if (op === "-") return -value;
  ctx.errors.push(
    makeError(
      AssemblerErrorCode.ExprConstMinusExtern,
      `Unsupported op '${op}' with external symbol`
    )
  );
  return 0;
}

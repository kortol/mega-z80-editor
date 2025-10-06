import { AssemblerErrorCode } from "../errors";
import { EvalContext } from "./eval";
import { EvalResult, Expr } from "./types";

function makeConst(val: number, ctx: EvalContext): EvalResult {
  if (!Number.isFinite(val)) {
    ctx.errors.push({ code: AssemblerErrorCode.ExprNaN });
    return { kind: "Const", value: 0 };
  }
  return { kind: "Const", value: val };
}

export function evalExpr(expr: Expr, ctx: EvalContext): EvalResult {
  switch (expr.kind) {
    case "Const":
      return { kind: "Const", value: expr.value };

    case "Symbol": {
      if (ctx.visiting.has(expr.name)) {
        ctx.errors.push({ code: AssemblerErrorCode.ExprCircularRef });
        return { kind: "Const", value: 0 };
      }
      // 再帰的にEQU式を評価する可能性あり
      if (ctx.symbols.has(expr.name)) {
        const def = ctx.symbols.get(expr.name)!;
        if (typeof def === "number") {
          return { kind: "Const", value: def };
        } else {
          ctx.visiting.add(expr.name);
          const res = evalExpr(def as Expr, ctx);
          ctx.visiting.delete(expr.name);
          return res;
        }
      }
      if (ctx.externs.has(expr.name)) {
        return { kind: "Reloc", sym: expr.name, addend: 0 };
      }
      // 未定義シンボル
      ctx.errors.push({ code: AssemblerErrorCode.ExprUndefinedSymbol });
      // return { kind: "Reloc", sym: expr.name, addend: 0 };
      return { kind: "Error", code: AssemblerErrorCode.ExprUndefinedSymbol };
    }

    case "Unary": {
      const inner = evalExpr(expr.expr, ctx);
      console.log(inner);
      if (inner.kind === "Const") {
        if (expr.op === "+") return { kind: "Const", value: +inner.value };
        if (expr.op === "-") return { kind: "Const", value: -inner.value };
        return makeConst(NaN, ctx);
      } else if (inner.kind === "Reloc") {
        // -EXT はNG
        ctx.errors.push({ code: AssemblerErrorCode.ExprExternArithmetic });
        return { kind: "Error", code: AssemblerErrorCode.ExprExternArithmetic };
      }
      return makeConst(NaN, ctx);
    }

    case "Paren":
      return evalExpr(expr.expr, ctx);

    case "Binary": {
      const L = evalExpr(expr.left, ctx);
      const R = evalExpr(expr.right, ctx);

      // 両方 Const → 即値計算
      if (L.kind === "Const" && R.kind === "Const") {
        switch (expr.op) {
          case "+": return makeConst(L.value + R.value, ctx);
          case "-": return makeConst(L.value - R.value, ctx);
          case "*": return makeConst(L.value * R.value, ctx);
          case "/":
            if (R.value === 0) {
              ctx.errors.push({ code: AssemblerErrorCode.ExprDivideByZero });
              return { kind: "Error", code: AssemblerErrorCode.ExprDivideByZero };
            }
            return makeConst(Math.floor(L.value / R.value), ctx);
          case "%":
            if (R.value === 0) {
              ctx.errors.push({ code: AssemblerErrorCode.ExprDivideByZero });
              return { kind: "Error", code: AssemblerErrorCode.ExprDivideByZero };
            }
            return makeConst(L.value % R.value, ctx);
          default:
            ctx.errors.push({ code: AssemblerErrorCode.ExprNaN });
            return { kind: "Error", code: AssemblerErrorCode.ExprNaN };
        }
      }

      // extern ± const
      if (L.kind === "Reloc" && R.kind === "Const") {
        if (expr.op === "+") {
          return { kind: "Reloc", sym: L.sym, addend: L.addend + R.value };
        }
        if (expr.op === "-") {
          return { kind: "Reloc", sym: L.sym, addend: L.addend - R.value };
        }
        ctx.errors.push({ code: AssemblerErrorCode.ExprExternArithmetic });
        return { kind: "Error", code: AssemblerErrorCode.ExprExternArithmetic };
      }

      if (L.kind === "Const" && R.kind === "Reloc") {
        if (expr.op === "+") {
          // const + extern → extern + const に入れ替え
          return { kind: "Reloc", sym: R.sym, addend: R.addend + L.value };
        }
        if (expr.op === "-") {
          // const - extern → NG
          ctx.errors.push({ code: AssemblerErrorCode.ExprConstMinusExtern });
          return { kind: "Error", code: AssemblerErrorCode.ExprConstMinusExtern };
        }
        ctx.errors.push({ code: AssemblerErrorCode.ExprExternArithmetic });
        return { kind: "Error", code: AssemblerErrorCode.ExprExternArithmetic };
      }

      // extern 同士の演算はNG
      if (L.kind === "Reloc" && R.kind === "Reloc") {
        ctx.errors.push({ code: AssemblerErrorCode.ExprExternArithmetic });
        return { kind: "Error", code: AssemblerErrorCode.ExprExternArithmetic };
      }

      ctx.errors.push({ code: AssemblerErrorCode.ExprNaN });
      return { kind: "Error", code: AssemblerErrorCode.ExprNaN };
    }
  }
}

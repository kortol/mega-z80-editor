import { AsmContext, SourcePos, canon } from "../context";
import { resolveExpr16 } from "../encoder/utils";

function splitArrayAccess(expr: string): { name: string; indexExpr: string } | null {
  const trimmed = expr.trim();
  const start = trimmed.indexOf("[");
  if (start <= 0 || !trimmed.endsWith("]")) return null;
  return {
    name: trimmed.slice(0, start).trim(),
    indexExpr: trimmed.slice(start + 1, -1).trim(),
  };
}

export function resolveSjasmCompatRaw(ctx: AsmContext, expr: string, pos: SourcePos): string | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  const defineKey = canon(trimmed, ctx);
  const stringDefine = ctx.stringDefines?.get(defineKey);
  if (stringDefine != null) return stringDefine;

  const access = splitArrayAccess(trimmed);
  if (!access) return null;

  const values = ctx.sjasmArrays?.get(canon(access.name, ctx));
  if (!values) return null;

  const index = resolveSjasmCompatNumber(ctx, access.indexExpr, pos);
  if (index == null || index < 0 || index >= values.length) return null;
  return values[index];
}

export function resolveSjasmCompatNumber(ctx: AsmContext, expr: string, pos: SourcePos): number | null {
  const compat = resolveSjasmCompatRaw(ctx, expr, pos);
  if (compat == null) {
    try {
      return resolveExpr16(ctx, expr, pos);
    } catch {
      return null;
    }
  }

  try {
    return resolveExpr16(ctx, compat, pos);
  } catch {
    return null;
  }
}

// src/linker/expr/evalLinkExpr.ts
import {
  LinkResolveContext,
  ResolveFn,
  ResolveResult,
  EvalResult,
  EvalOptions,
} from "./types";

/**
 * P1-F: リンク時式評価 (flat + / - sequence of symbols and constants)
 *
 * 入力例:
 *   "1234"
 *   "FOO"
 *   "BAR+2"
 *   "EXTSYM-4"
 *   "FOO+BAR-4"
 *
 * 出力:
 *   { ok:true, value: number } または { ok:false, unresolved: [...] }
 */
export function evalLinkExpr(
  expr: string,
  resolve: ResolveFn,
  options: EvalOptions = {},
  ctx?: LinkResolveContext
): EvalResult {
  const wrap16 = options.wrap16 ?? true;
  const ops = options.ops ?? ["+", "-"];
  const maxDepth = options.maxDepth ?? 8;
  const unresolved = new Set<string>();
  const errors: string[] = [];

  const trim = expr.trim();
  if (!trim) return { ok: false, errors: ["Empty expression"] };

  // --- 1️⃣ 純定数 (16進 or 10進)
  const num = parseNumber(trim);
  if (num !== null) {
    return { ok: true, value: wrap16 ? num & 0xFFFF : num };
  }

  // --- 2️⃣ 平坦な + / - 連結式 ---
  const parsed = parseFlatExpression(trim);
  if (!parsed) {
    return { ok: false, errors: ["Unsupported expression (only flat +/- expressions supported)"] };
  }

  let total = 0;
  for (const term of parsed) {
    const numVal = parseNumber(term.token);
    if (numVal !== null) {
      total += term.sign * numVal;
      continue;
    }

    let sym: ResolveResult;
    try {
      sym = resolve(term.token, ctx);
    } catch (e) {
      return { ok: false, errors: [`Resolver threw exception: ${(e as Error).message}`] };
    }

    if (sym.kind === "defined") {
      total += term.sign * sym.addr;
      continue;
    }

    if (sym.kind === "extern" || sym.kind === "unknown") {
      unresolved.add(term.token);
      continue;
    }

    errors.push("Unexpected resolution state");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  if (unresolved.size > 0) {
    return { ok: false, unresolved: Array.from(unresolved) };
  }
  return { ok: true, value: wrap16 ? total & 0xFFFF : total };
}

/** 数値文字列 → number */
function parseNumber(token: string): number | null {
  const t = token.trim().toUpperCase();
  const sign = t.startsWith("-") ? -1 : 1;
  const body = t.replace(/^[+\-]/, "");
  if (/^[0-9A-F]+H$/.test(body)) return sign * parseInt(body.slice(0, -1), 16);
  if (/^0X[0-9A-F]+$/.test(body)) return sign * parseInt(body.slice(2), 16);
  if (/^[+\-]?\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

function parseFlatExpression(expr: string): Array<{ sign: 1 | -1; token: string }> | null {
  const tokens: Array<{ sign: 1 | -1; token: string }> = [];
  let i = 0;
  let sign: 1 | -1 = 1;
  while (i < expr.length) {
    while (i < expr.length && /\s/.test(expr[i]!)) i++;
    if (i >= expr.length) break;

    const ch = expr[i]!;
    if (ch === "+") {
      sign = 1;
      i++;
      continue;
    }
    if (ch === "-") {
      sign = -1;
      i++;
      continue;
    }

    const start = i;
    while (i < expr.length && !/[+\-\s]/.test(expr[i]!)) i++;
    const token = expr.slice(start, i).trim();
    if (!token) return null;
    tokens.push({ sign, token });
    sign = 1;
  }

  return tokens.length > 0 ? tokens : null;
}

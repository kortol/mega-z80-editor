import { AsmContext, defineSymbol } from "../context";
import { NodePseudo } from "../node";
import { makeError, AssemblerErrorCode, makeWarning } from "../errors";
import { tokenize } from "../tokenizer";
import { parseExpr } from "../expr/parserExpr";
import { evalExpr, EvalContext } from "../expr/eval";

export function handleEQU(ctx: AsmContext, node: NodePseudo) {
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
  const evalCtx: EvalContext = {
    symbols: ctx.symbols,
    externs: ctx.externs,
    pass: 1,
    errors: ctx.errors,
    visiting: new Set(),
    loc: ctx.loc,
  };
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
  // 既存シンボルとの衝突確認
  if (ctx.symbols.has(sym)) {
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

  defineSymbol(ctx, sym, val, "CONST", node.pos);
}

export function handleSYMLEN(ctx: AsmContext, node: NodePseudo) {
  const arg = node.args?.[0]?.value ?? "6";
  ctx.modeSymLen = parseInt(arg, 10);
}

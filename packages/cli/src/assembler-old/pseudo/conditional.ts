import { AsmContext } from "../context";
import { AssemblerErrorCode, makeError } from "../errors";
import { evalExpr, EvalContext } from "../expr/eval";
import { parseExpr } from "../expr/parserExpr";
import { NodePseudo } from "../parser";
import { tokenize } from "../tokenizer";

export function isConditionalOp(op: string): boolean {
  const u = op.toUpperCase();
  return u === "IF" || u === "ELSEIF" || u === "ELSE" || u === "ENDIF" || u === "IFIDN";
}

export function isConditionActive(ctx: AsmContext): boolean {
  if (!ctx.condStack?.length) return true;
  return ctx.condStack.every((f) => f.active);
}

function evalConditionExpr(ctx: AsmContext, exprText: string, pos: any): boolean {
  const text = exprText?.trim() ?? "";
  if (!text) return false;
  const tokens = tokenize(ctx, text).filter((t) => t.kind !== "eol");
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
  if (res.kind === "Const") return res.value !== 0;

  ctx.errors.push(
    makeError(
      AssemblerErrorCode.ExprNotConstant,
      `Conditional expression is not constant: ${exprText}`,
      { pos }
    )
  );
  return false;
}

function normalizeIdn(ctx: AsmContext, raw: string): string {
  let s = (raw ?? "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return ctx.caseInsensitive ? s.toUpperCase() : s;
}

function evalIfIdn(ctx: AsmContext, node: NodePseudo): boolean {
  const left = node.args?.[0]?.value ?? "";
  const right = node.args?.[1]?.value ?? "";
  if (!left || !right) {
    ctx.errors.push(
      makeError(
        AssemblerErrorCode.SyntaxError,
        "IFIDN requires two arguments",
        { pos: node.pos }
      )
    );
    return false;
  }
  return normalizeIdn(ctx, left) === normalizeIdn(ctx, right);
}

export function handleConditional(ctx: AsmContext, node: NodePseudo): void {
  const op = node.op.toUpperCase();
  if (!ctx.condStack) ctx.condStack = [];
  const stack = ctx.condStack;

  if (op === "IF" || op === "IFIDN") {
    const parentActive = isConditionActive(ctx);
    const cond = parentActive
      ? (op === "IF" ? evalConditionExpr(ctx, node.args?.[0]?.value ?? "", node.pos) : evalIfIdn(ctx, node))
      : false;
    stack.push({
      parentActive,
      active: parentActive && cond,
      satisfied: parentActive && cond,
    });
    return;
  }

  if (op === "ELSEIF") {
    if (stack.length === 0) {
      ctx.errors.push(makeError(AssemblerErrorCode.SyntaxError, "ELSEIF without IF", { pos: node.pos }));
      return;
    }
    const frame = stack[stack.length - 1];
    if (frame.elseSeen) {
      ctx.errors.push(makeError(AssemblerErrorCode.SyntaxError, "ELSEIF after ELSE", { pos: node.pos }));
      return;
    }
    if (!frame.parentActive) {
      frame.active = false;
      return;
    }
    if (frame.satisfied) {
      frame.active = false;
      return;
    }
    const cond = evalConditionExpr(ctx, node.args?.[0]?.value ?? "", node.pos);
    frame.active = cond;
    if (cond) frame.satisfied = true;
    return;
  }

  if (op === "ELSE") {
    if (stack.length === 0) {
      ctx.errors.push(makeError(AssemblerErrorCode.SyntaxError, "ELSE without IF", { pos: node.pos }));
      return;
    }
    const frame = stack[stack.length - 1];
    if (frame.elseSeen) {
      ctx.errors.push(makeError(AssemblerErrorCode.SyntaxError, "Duplicate ELSE", { pos: node.pos }));
      return;
    }
    frame.elseSeen = true;
    if (!frame.parentActive) {
      frame.active = false;
      return;
    }
    if (frame.satisfied) {
      frame.active = false;
      return;
    }
    frame.active = true;
    frame.satisfied = true;
    return;
  }

  if (op === "ENDIF") {
    if (stack.length === 0) {
      ctx.errors.push(makeError(AssemblerErrorCode.SyntaxError, "ENDIF without IF", { pos: node.pos }));
      return;
    }
    stack.pop();
    return;
  }
}

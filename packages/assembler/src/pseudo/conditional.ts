import { AsmContext } from "../context";
import { AssemblerErrorCode, makeError } from "../errors";
import { evalExpr, EvalContext } from "../expr/eval";
import { parseExpr } from "../expr/parserExpr";
import { NodePseudo } from "../node";
import { tokenize } from "../tokenizer";

export function isConditionalOp(op: string): boolean {
  const u = op.toUpperCase();
  return u === "IF" || u === "ELSEIF" || u === "ELSE" || u === "ENDIF" || u === "IFIDN"
    || u === "IFDIF" || u === "IFDEF" || u === "IFNDEF" || u === "IFB" || u === "IFNB";
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
    currentGlobalLabel: ctx.currentGlobalLabel,
    caseInsensitive: ctx.caseInsensitive,
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
  if (s.startsWith("<") && s.endsWith(">")) {
    s = s.slice(1, -1);
  }
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

function evalIfDef(ctx: AsmContext, node: NodePseudo, negate = false): boolean {
  const symRaw = node.args?.[0]?.value?.trim() ?? "";
  if (!symRaw) {
    ctx.errors.push(
      makeError(
        AssemblerErrorCode.SyntaxError,
        `${negate ? "IFNDEF" : "IFDEF"} requires symbol`,
        { pos: node.pos }
      )
    );
    return false;
  }
  const sym = ctx.caseInsensitive ? symRaw.toUpperCase() : symRaw;
  const ok = ctx.symbols.has(sym) || ctx.externs.has(sym);
  return negate ? !ok : ok;
}

function evalIfBlank(ctx: AsmContext, node: NodePseudo, negate = false): boolean {
  const raw = node.args?.[0]?.value;
  if (raw == null) {
    ctx.errors.push(
      makeError(
        AssemblerErrorCode.SyntaxError,
        `${negate ? "IFNB" : "IFB"} requires <text>`,
        { pos: node.pos }
      )
    );
    return false;
  }
  const text = normalizeIdn(ctx, raw);
  const isBlank = text.length === 0;
  return negate ? !isBlank : isBlank;
}

export function handleConditional(ctx: AsmContext, node: NodePseudo): void {
  const op = node.op.toUpperCase();
  if (!ctx.condStack) ctx.condStack = [];
  const stack = ctx.condStack;

  if (op === "IF" || op === "IFIDN" || op === "IFDIF" || op === "IFDEF" || op === "IFNDEF" || op === "IFB" || op === "IFNB") {
    const parentActive = isConditionActive(ctx);
    let cond = false;
    if (parentActive) {
      if (op === "IF") cond = evalConditionExpr(ctx, node.args?.[0]?.value ?? "", node.pos);
      else if (op === "IFIDN") cond = evalIfIdn(ctx, node);
      else if (op === "IFDIF") cond = !evalIfIdn(ctx, node);
      else if (op === "IFDEF") cond = evalIfDef(ctx, node, false);
      else if (op === "IFNDEF") cond = evalIfDef(ctx, node, true);
      else if (op === "IFB") cond = evalIfBlank(ctx, node, false);
      else if (op === "IFNB") cond = evalIfBlank(ctx, node, true);
    }
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

import { AsmContext, createContext } from "../../context";
import { tokenize } from "../../tokenizer";
import { EvalContext, evalExpr } from "../eval";
import { parseExpr } from "../parserExpr";
import { Expr } from "../types";

function parseE(ctx: AsmContext, src: string): Expr {
  const toks = tokenize(ctx, src).filter((t) => t.kind !== "eol");
  return parseExpr(toks);
}

function makeCtx() {
  return createContext({ moduleName: "TEST" });
}

function makeEvalCtx(): EvalContext {
  return {
    symbols: new Map([]),
    externs: new Set(),
    pass: 2,
    errors: [],
    visiting: new Set(),
    loc: 0,
  };
}

describe("parserExpr", () => {
  test("1+2*3", () => {
    const ctx = makeCtx();
    const e = parseE(ctx, "1+2*3");
    expect(e).toEqual({
      kind: "Binary",
      op: "+",
      left: { kind: "Const", value: 1 },
      right: {
        kind: "Binary",
        op: "*",
        left: { kind: "Const", value: 2 },
        right: { kind: "Const", value: 3 },
      },
    });
    expect(evalExpr(e, makeEvalCtx())).toEqual({ kind: "Const", value: 7 });
  });

  test("1*2+3", () => {
    const ctx = makeCtx();
    const e = parseE(ctx, "1*2+3");
    expect(e).toEqual({
      kind: "Binary",
      op: "+",
      left: {
        kind: "Binary",
        op: "*",
        left: { kind: "Const", value: 1 },
        right: { kind: "Const", value: 2 },
      },
      right: { kind: "Const", value: 3 },
    });
    expect(evalExpr(e, makeEvalCtx())).toEqual({ kind: "Const", value: 5 });
  });

  test("-(1+2)", () => {
    const ctx = makeCtx();
    const e = parseE(ctx, "-(1+2)");
    expect(e).toEqual({
      kind: "Unary",
      op: "-",
      expr: {
        kind: "Binary",
        op: "+",
        left: { kind: "Const", value: 1 },
        right: { kind: "Const", value: 2 },
      },
    });
    expect(evalExpr(e, makeEvalCtx())).toEqual({ kind: "Const", value: -3 });
  });

  test("101%5", () => {
    const ctx = makeCtx();
    const e = parseE(ctx, "101%5");
    expect(e).toEqual({
      kind: "Binary",
      op: "%",
      left: { kind: "Const", value: 101 },
      right: { kind: "Const", value: 5 },
    });
    expect(evalExpr(e, makeEvalCtx())).toEqual({ kind: "Const", value: 1 });
  });

  test("FOO+10", () => {
    const ctx = makeCtx();
    const e = parseE(ctx, "FOO+10");
    expect(e).toEqual({
      kind: "Binary",
      op: "+",
      left: { kind: "Symbol", name: "FOO" },
      right: { kind: "Const", value: 10 },
    });
    expect(evalExpr(e, makeEvalCtx())).toEqual({
      kind: "Reloc",
      sym: "FOO",
      addend: 10,
    });
  });

  test("nested precedence: (1+2)*3", () => {
    const ctx = makeCtx();
    const e = parseE(ctx, "(1+2)*3");
    expect(e).toEqual({
      kind: "Binary",
      op: "*",
      left: {
        kind: "Binary",
        op: "+",
        left: { kind: "Const", value: 1 },
        right: { kind: "Const", value: 2 },
      },
      right: { kind: "Const", value: 3 },
    });
  });

  test("unary plus", () => {
    const ctx = makeCtx();
    const e = parseE(ctx, "+5");
    expect(e).toEqual({
      kind: "Unary",
      op: "+",
      expr: { kind: "Const", value: 5 },
    });
  });

  test("bitwise and/or/xor", () => {
    const ctx = makeCtx();
    const e = parseE(ctx, "1|2&3^4");
    // precedence (compat): ^ > & > |
    expect(evalExpr(e, makeEvalCtx())).toEqual({ kind: "Const", value: 1 | (2 & (3 ^ 4)) });
  });

  test("bitwise precedence guard: ^ > &", () => {
    const ctx = makeCtx();
    const e = parseE(ctx, "1^2&4");
    // if ^ > &: (1^2)=3, 3&4=0
    expect(evalExpr(e, makeEvalCtx())).toEqual({ kind: "Const", value: 0 });
  });

  test("shift and compare", () => {
    const ctx = makeCtx();
    const e = parseE(ctx, "1+2<<3 == 24");
    expect(evalExpr(e, makeEvalCtx())).toEqual({ kind: "Const", value: 1 });
  });

  test("unary not and bitwise not", () => {
    const ctx = makeCtx();
    const e1 = parseE(ctx, "!0");
    expect(evalExpr(e1, makeEvalCtx())).toEqual({ kind: "Const", value: 1 });
    const e2 = parseE(ctx, "~0");
    expect(evalExpr(e2, makeEvalCtx())).toEqual({ kind: "Const", value: -1 });
  });

  test("invalid: 1+", () => {
    const ctx = makeCtx();
    expect(() => parseE(ctx, "1+")).toThrow(/Unexpected/);
  });

  test("invalid: )", () => {
    const ctx = makeCtx();
    expect(() => parseE(ctx, ")")).toThrow(/Syntax error/);
  });
});

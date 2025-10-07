import { tokenize } from "../../tokenizer";
import { EvalContext, evalExpr } from "../eval";
import { parseExpr } from "../parserExpr";
import { Expr } from "../types";

function parseE(src: string): Expr {
  const toks = tokenize(src).filter((t) => t.kind !== "eol");
  return parseExpr(toks);
}

function makeCtx(): EvalContext {
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
    const e = parseE("1+2*3");
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
    expect(evalExpr(e, makeCtx())).toEqual({ kind: "Const", value: 7 });
  });

  test("1*2+3", () => {
    const e = parseE("1*2+3");
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
    expect(evalExpr(e, makeCtx())).toEqual({ kind: "Const", value: 5 });
  });

  test("-(1+2)", () => {
    const e = parseE("-(1+2)");
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
    expect(evalExpr(e, makeCtx())).toEqual({ kind: "Const", value: -3 });
  });

  test("101%5", () => {
    const e = parseE("101%5");
    expect(e).toEqual({
      kind: "Binary",
      op: "%",
      left: { kind: "Const", value: 101 },
      right: { kind: "Const", value: 5 },
    });
    expect(evalExpr(e, makeCtx())).toEqual({ kind: "Const", value: 1 });
  });

  test("FOO+10", () => {
    const e = parseE("FOO+10");
    expect(e).toEqual({
      kind: "Binary",
      op: "+",
      left: { kind: "Symbol", name: "FOO" },
      right: { kind: "Const", value: 10 },
    });
    expect(evalExpr(e, makeCtx())).toEqual({
      kind: "Reloc",
      sym: "FOO",
      addend: 10,
    });
  });

  test("nested precedence: (1+2)*3", () => {
    const e = parseE("(1+2)*3");
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
    const e = parseE("+5");
    expect(e).toEqual({
      kind: "Unary",
      op: "+",
      expr: { kind: "Const", value: 5 },
    });
  });

  test("invalid: 1+", () => {
    expect(() => parseE("1+")).toThrow(/Unexpected/);
  });

  test("invalid: )", () => {
    expect(() => parseE(")")).toThrow(/Syntax error/);
  });
});

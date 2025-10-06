import { tokenize } from "../../tokenizer";
import { EvalContext } from "../eval";
import { evalExpr } from "../evalExpr";
import { parseExpr } from "../parserExpr";
import { Expr } from "../types";

function formatResult(res: any): string {
  // console.log(res);
  if (res.kind === "Const") return `const(${res.value})`;
  if (res.kind === "Reloc") return `extern(${res.sym}+${res.addend})`;
  if (res.kind === "Error") return `error(${res.message})`;
  return "unknown";
}

describe("evalExpr", () => {
  let ctx: EvalContext;
  beforeEach(() => {
    ctx = {
      symbols: new Map(),
      externs: new Set(),
      pass: 1,
      errors: [],
      visiting: new Set(),
    };
    ctx.symbols.set("FOO", 10);
    ctx.symbols.set("BAR", 20);
    ctx.symbols.set("ZERO", 0);
    ctx.externs.add("EXT");
    ctx.externs.add("EXT1");
    ctx.externs.add("EXT2");
    return ctx;
  });

  function parseE(expr: string): Expr {
    const token = tokenize(expr).filter(t => t.kind !== "eol");
    const e = parseExpr(token);
    return e;
  }

  describe("内部シンボル同士", () => {
    test("FOO+BAR => const(30)", () => {
      expect(formatResult(evalExpr(parseE("FOO+BAR"), ctx))).toBe("const(30)");
    });

    test("FOO-BAR => const(-10)", () => {
      expect(formatResult(evalExpr(parseE("FOO-BAR"), ctx))).toBe("const(-10)");
    });

    test("FOO*BAR => const(200)", () => {
      expect(formatResult(evalExpr(parseE("FOO*BAR"), ctx))).toBe("const(200)");
    });

    test("BAR/FOO => const(2)", () => {
      expect(formatResult(evalExpr(parseE("BAR/FOO"), ctx))).toBe("const(2)");
    });

    test("除算ゼロ => error", () => {
      expect(evalExpr(parseE("FOO/ZERO"), ctx).kind).toBe("Error");
    });
  });

  describe("外部シンボル単独", () => {
    test("EXT => extern(EXT+0)", () => {
      expect(formatResult(evalExpr(parseE("EXT"), ctx))).toBe("extern(EXT+0)");
    });

    test("-EXT => error", () => {
      expect(evalExpr(parseE("-EXT"), ctx).kind).toBe("Error");
    });

    test("2*EXT => error", () => {
      expect(evalExpr(parseE("2*EXT"), ctx).kind).toBe("Error");
    });
  });

  describe("外部＋定数", () => {
    test("EXT+1 => extern(EXT+1)", () => {
      expect(formatResult(evalExpr(parseE("EXT+1"), ctx))).toBe("extern(EXT+1)");
    });

    test("1+EXT => extern(EXT+1)", () => {
      expect(formatResult(evalExpr(parseE("1+EXT"), ctx))).toBe("extern(EXT+1)");
    });

    test("EXT-1 => extern(EXT+-1)", () => {
      expect(formatResult(evalExpr(parseE("EXT-1"), ctx))).toBe("extern(EXT+-1)");
    });

    test("5-EXT => error", () => {
      expect(evalExpr(parseE("5-EXT"), ctx).kind).toBe("Error");
    });
  });

  describe("外部＋内部", () => {
    test("EXT+FOO => extern(EXT+10)", () => {
      expect(formatResult(evalExpr(parseE("EXT+FOO"), ctx))).toBe("extern(EXT+10)");
    });

    test("FOO+EXT => extern(EXT+10)", () => {
      expect(formatResult(evalExpr(parseE("FOO+EXT"), ctx))).toBe("extern(EXT+10)");
    });

    test("EXT-FOO => extern(EXT+-10)", () => {
      expect(formatResult(evalExpr(parseE("EXT-FOO"), ctx))).toBe("extern(EXT+-10)");
    });

    test("FOO-EXT => error", () => {
      expect(evalExpr(parseE("FOO-EXT"), ctx).kind).toBe("Error");
    });

    test("EXT+BAR (未定義) => error", () => {
      expect(evalExpr(parseE("EXT+BAR2"), ctx).kind).toBe("Error");
    });
  });

  describe("外部が2つ以上", () => {
    test("EXT1+EXT2 => error", () => {
      expect(evalExpr(parseE("EXT1+EXT2"), ctx).kind).toBe("Error");
    });

    test("EXT1-EXT2 => error", () => {
      expect(evalExpr(parseE("EXT1-EXT2"), ctx).kind).toBe("Error");
    });
  });
});

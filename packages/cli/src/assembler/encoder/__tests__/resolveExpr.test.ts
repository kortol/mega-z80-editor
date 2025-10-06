import { AsmContext, createContext } from "../../context";
import { EvalContext } from "../../expr/eval";
import { evalExpr } from "../../expr/evalExpr";
import { parseExpr } from "../../expr/parserExpr";
import { tokenize } from "../../tokenizer";
import { resolveExpr16, resolveExpr8 } from "../utils";

// function makeCtx(): EvalContext {
//   const ctx: EvalContext = {
//     symbols: new Map(),
//     externs: new Set(),
//     pass: 1,
//     errors: [],
//     visiting: new Set(),
//   };
//   ctx.symbols.set("FOO", 10);
//   ctx.symbols.set("BAR", 20);
//   ctx.symbols.set("ZERO", ctx.loc);
//   ctx.externs.add("EXT");
//   ctx.externs.add("EXT1");
//   ctx.externs.add("EXT2");
//   return ctx;
// }

function makeCtx(): AsmContext {
  const ctx = createContext({
    loc: 0,
    moduleName: "TEST",
    symbols: new Map(),
  });
  ctx.symbols.set("FOO", 10);
  ctx.symbols.set("BAR", 20);
  ctx.symbols.set("ZERO", 0);
  ctx.externs.add("EXT");
  ctx.externs.add("EXT1");
  ctx.externs.add("EXT2");
  return ctx;
}


describe("resolveExpr8/16", () => {
  // let ctx: EvalContext;
  let ctx: AsmContext;
  beforeEach(() => {
    ctx = makeCtx();
  });

  describe("即値のみ", () => {
    test("5 => 5", () => {
      expect(resolveExpr8(ctx, "5", ctx.loc)).toBe(5);
    });

    test("FOO+BAR => 30", () => {
      expect(resolveExpr8(ctx, "FOO+BAR", ctx.loc)).toBe(30);
    });

    test("FOO/BAR => 0 (10/20=0)", () => {
      expect(resolveExpr8(ctx, "FOO/BAR", ctx.loc)).toBe(0);
    });

    test("除算ゼロはエラー", () => {
      expect(() => resolveExpr8(ctx, "FOO/ZERO", ctx.loc, true)).toThrow();
    });
  });

  describe("外部参照（単独/±定数）", () => {
    test("EXT", () => {
      const val = resolveExpr8(ctx, "EXT", ctx.loc);
      expect(val).toBe(0);
      expect(ctx.unresolved).toContainEqual({
        addr: 0, symbol: "EXT", addend: 0, size: 1,
      });
    });

    test("EXT+1", () => {
      resolveExpr8(ctx, "EXT+1", ctx.loc);
      expect(ctx.unresolved).toContainEqual({
        addr: 0, symbol: "EXT", addend: 1, size: 1,
      });
    });

    test("1+EXT (入れ替え)", () => {
      resolveExpr8(ctx, "1+EXT", ctx.loc);
      expect(ctx.unresolved).toContainEqual({
        addr: 0, symbol: "EXT", addend: 1, size: 1,
      });
    });

    test("EXT-1", () => {
      resolveExpr16(ctx, "EXT-1", ctx.loc);
      expect(ctx.unresolved).toContainEqual({
        addr: 0, symbol: "EXT", addend: -1, size: 2,
      });
    });

    test("5-EXT はエラー", () => {
      expect(() => resolveExpr8(ctx, "5-EXT", ctx.loc, true)).toThrow();
    });

    test("-EXT はエラー", () => {
      expect(() => resolveExpr8(ctx, "-EXT", ctx.loc, true)).toThrow();
    });
  });

  describe("外部＋内部", () => {
    test("EXT+FOO => unresolved(addend=10)", () => {
      resolveExpr8(ctx, "EXT+FOO", ctx.loc);
      expect(ctx.unresolved).toContainEqual({
        addr: 0, symbol: "EXT", addend: 10, size: 1,
      });
    });

    test("FOO+EXT => unresolved(addend=10)", () => {
      resolveExpr8(ctx, "FOO+EXT", ctx.loc);
      expect(ctx.unresolved).toContainEqual({
        addr: 0, symbol: "EXT", addend: 10, size: 1,
      });
    });

    test("EXT-FOO => unresolved(addend=-10)", () => {
      resolveExpr8(ctx, "EXT-FOO", ctx.loc);
      expect(ctx.unresolved).toContainEqual({
        addr: 0, symbol: "EXT", addend: -10, size: 1,
      });
    });

    test("FOO-EXT はエラー", () => {
      expect(() => resolveExpr8(ctx, "FOO-EXT", ctx.loc, true)).toThrow();
    });

    test("EXT+BAR (未定義) はエラー", () => {
      expect(() => resolveExpr8(ctx, "EXT+BAR2", ctx.loc, true)).toThrow();
    });
  });

  describe("外部が2つ以上", () => {
    test("EXT1+EXT2 はエラー", () => {
      expect(() => resolveExpr16(ctx, "EXT1+EXT2", ctx.loc, true)).toThrow();
    });
    test("EXT1-EXT2 はエラー", () => {
      expect(() => resolveExpr16(ctx, "EXT1-EXT2", ctx.loc, true)).toThrow();
    });
  });

  describe("サイズ境界チェック", () => {
    test("300 in resolveExpr8 → 範囲外エラー", () => {
      expect(() => resolveExpr8(ctx, "300", ctx.loc, true)).toThrow();
    });

    test("300 in resolveExpr16 → OK", () => {
      expect(resolveExpr16(ctx, "300", ctx.loc)).toBe(300);
    });

    test("EXT+1 in resolveExpr8 → size=1", () => {
      resolveExpr8(ctx, "EXT+1", ctx.loc);
      expect(ctx.unresolved[0].size).toBe(1);
    });

    test("EXT+1 in resolveExpr16 → size=2", () => {
      resolveExpr16(ctx, "EXT+1", ctx.loc);
      expect(ctx.unresolved[0].size).toBe(2);
    });
  });
});

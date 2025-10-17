import { AsmContext, createContext, defineSymbol } from "../../context";
import { resolveExpr16, resolveExpr8 } from "../utils";

function makeCtx(): AsmContext {
  const ctx = createContext({
    loc: 0,
    moduleName: "TEST",
    phase: "emit"
  });
  defineSymbol(ctx, "FOO", 10, "CONST");
  defineSymbol(ctx, "BAR", 20, "CONST");
  defineSymbol(ctx, "ZERO", 0, "CONST");
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
      expect(resolveExpr8(ctx, "5", { line: 0, file: "test.asm" })).toBe(5);
    });

    test("FOO+BAR => 30", () => {
      expect(resolveExpr8(ctx, "FOO+BAR", { line: 0, file: "test.asm" })).toBe(30);
    });

    test("FOO/BAR => 0 (10/20=0)", () => {
      expect(resolveExpr8(ctx, "FOO/BAR", { line: 0, file: "test.asm" })).toBe(0);
    });

    test("除算ゼロはエラー", () => {
      expect(() => resolveExpr8(ctx, "FOO/ZERO", { line: 0, file: "test.asm" }, true)).toThrow();
    });
  });

  describe("外部参照（単独/±定数）", () => {
    test("EXT", () => {
      const val = resolveExpr8(ctx, "EXT", { line: 0, file: "test.asm" });
      expect(val).toBe(0);
      expect(ctx.unresolved).toContainEqual({
        addr: 1, symbol: "EXT", size: 1,
      });
    });

    test("EXT+1", () => {
      resolveExpr8(ctx, "EXT+1", { line: 0, file: "test.asm" });
      expect(ctx.unresolved).toContainEqual({
        addr: 1, symbol: "EXT", addend: 1, size: 1,
      });
    });

    test("1+EXT (入れ替え)", () => {
      resolveExpr8(ctx, "1+EXT", { line: 0, file: "test.asm" });
      expect(ctx.unresolved).toContainEqual({
        addr: 1, symbol: "EXT", addend: 1, size: 1,
      });
    });

    test("EXT-1", () => {
      resolveExpr16(ctx, "EXT-1", { line: 0, file: "test.asm" });
      expect(ctx.unresolved).toContainEqual({
        addr: 1, symbol: "EXT", addend: -1, size: 2, "requester": { "op": "ENCODER", "phase": "assemble", pos: { "line": 0, file: "test.asm" } },
      });
    });

    test("5-EXT はエラー", () => {
      expect(() => resolveExpr8(ctx, "5-EXT", { line: 0, file: "test.asm" }, true)).toThrow();
    });

    test("-EXT はエラー", () => {
      expect(() => resolveExpr8(ctx, "-EXT", { line: 0, file: "test.asm" }, true)).toThrow();
    });
  });

  describe("外部＋内部", () => {
    test("EXT+FOO => unresolved(addend=10)", () => {
      resolveExpr8(ctx, "EXT+FOO", { line: 0, file: "test.asm" });
      expect(ctx.unresolved).toContainEqual({
        addr: 1, symbol: "EXT", addend: 10, size: 1,
      });
    });

    test("FOO+EXT => unresolved(addend=10)", () => {
      resolveExpr8(ctx, "FOO+EXT", { line: 0, file: "test.asm" });
      expect(ctx.unresolved).toContainEqual({
        addr: 1, symbol: "EXT", addend: 10, size: 1,
      });
    });

    test("EXT-FOO => unresolved(addend=-10)", () => {
      resolveExpr8(ctx, "EXT-FOO", { line: 0, file: "test.asm" });
      expect(ctx.unresolved).toContainEqual({
        addr: 1, symbol: "EXT", addend: -10, size: 1,
      });
    });

    test("FOO-EXT はエラー", () => {
      expect(() => resolveExpr8(ctx, "FOO-EXT", { line: 0, file: "test.asm" }, true)).toThrow();
    });

    test("EXT+BAR (未定義) はエラー", () => {
      expect(() => resolveExpr8(ctx, "EXT+BAR2", { line: 0, file: "test.asm" }, true)).toThrow();
    });
  });

  describe("外部が2つ以上", () => {
    test("EXT1+EXT2 はエラー", () => {
      expect(() => resolveExpr16(ctx, "EXT1+EXT2", { line: 0, file: "test.asm" }, true)).toThrow();
    });
    test("EXT1-EXT2 はエラー", () => {
      expect(() => resolveExpr16(ctx, "EXT1-EXT2", { line: 0, file: "test.asm" }, true)).toThrow();
    });
  });

  describe("サイズ境界チェック", () => {
    test("300 in resolveExpr8 → 範囲外エラー", () => {
      expect(() => resolveExpr8(ctx, "300", { line: 0, file: "test.asm" }, true)).toThrow();
    });

    test("300 in resolveExpr16 → OK", () => {
      expect(resolveExpr16(ctx, "300", { line: 0, file: "test.asm" })).toBe(300);
    });

    test("EXT+1 in resolveExpr8 → size=1", () => {
      resolveExpr8(ctx, "EXT+1", { line: 0, file: "test.asm" });
      expect(ctx.unresolved[0].size).toBe(1);
    });

    test("EXT+1 in resolveExpr16 → size=2", () => {
      resolveExpr16(ctx, "EXT+1", { line: 0, file: "test.asm" });
      expect(ctx.unresolved[0].size).toBe(2);
    });
  });
});

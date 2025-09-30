import { AsmContext } from "../../context";
import { NodePseudo } from "../../parser";
import { handlePseudo } from "../../pseudo";

function makeCtx(): AsmContext {
  return {
    loc: 0,
    moduleName: "TEST",
    symbols: new Map(),
    unresolved: [],
    modeWord32: false,
    modeSymLen: 6,
    caseInsensitive: true,
    texts: [],
    endReached: false
  };
}

function makeNode(op: string, args: string[] = [], line = 1): NodePseudo {
  return { kind: "pseudo", op, args, line };
}

describe("pseudo - DB/DW", () => {
  test("DB with numeric list", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DB", ["1", "2", "3"]));
    expect(ctx.texts[0].data).toEqual([1, 2, 3]);
  });

  test("DB with char literal", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DB", ["'A'"]));
    expect(ctx.texts[0].data).toEqual([0x41]);
  });

  test("DB with string literal", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode('DB', ['"ABC"']));
    expect(ctx.texts[0].data).toEqual([0x41, 0x42, 0x43]);
  });

  test("DB with mixed args", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DB", ["'A'", '"BC"', "5"]));
    expect(ctx.texts[0].data).toEqual([0x41, 0x42, 0x43, 5]);
  });

  test("DW with numeric value", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DW", ["1234H"]));
    expect(ctx.texts[0].data).toEqual([0x34, 0x12]);
  });

  test("DW with char literal", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DW", ["'A'"]));
    expect(ctx.texts[0].data).toEqual([0x41, 0x00]);
  });

  test("DW with string literal (error)", () => {
    const ctx = makeCtx();
    expect(() =>
      handlePseudo(ctx, makeNode("DW", ['"AB"']))
    ).toThrow(/does not support/i);
  });

  test(".WORD32 with no operand sets flag", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode(".WORD32", []));
    expect(ctx.modeWord32).toBe(true);
  });

  test(".WORD32 with operand throws", () => {
    const ctx = makeCtx();
    expect(() => handlePseudo(ctx, makeNode(".WORD32", ["100H"])))
      .toThrow(/does not take operands/);
  });
});

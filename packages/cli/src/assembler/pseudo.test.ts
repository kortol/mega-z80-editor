import { AsmContext } from "./context";
import { handlePseudo } from "./pseudo";
import { NodePseudo } from "./parser";

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
  };
}

function makeNode(op: string, args: string[], line = 1): NodePseudo {
  return { kind: "pseudo", op, args, line };
}

describe("pseudo", () => {
  test("ORG 100H → loc=0x100", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("ORG", ["100H"]));
    expect(ctx.loc).toBe(0x100);
  });

  test("DB 1,2,3 → textsに [01,02,03]", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DB", ["1","2","3"]));
    expect(ctx.texts[0].data).toEqual([1,2,3]);
    expect(ctx.loc).toBe(3);
  });

  test("DW 1234H → textsに [34,12]", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DW", ["1234H"]));
    expect(ctx.texts[0].data).toEqual([0x34,0x12]);
    expect(ctx.loc).toBe(2);
  });

  test(".WORD32 → modeWord32=true", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode(".WORD32", []));
    expect(ctx.modeWord32).toBe(true);
  });

  test(".SYMLEN 6 → modeSymLen=6", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode(".SYMLEN", ["6"]));
    expect(ctx.modeSymLen).toBe(6);
  });

  test("EQU → symbol登録", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("EQU", ["FOO","10"]));
    expect(ctx.symbols.get("FOO")).toBe(10);
  });

  test("EQU 再定義 → error", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("EQU", ["FOO","10"]));
    expect(() => handlePseudo(ctx, makeNode("EQU", ["FOO","20"])))
      .toThrow(/redefined/);
  });

  test("END → endReached=true", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("END", []));
    expect(ctx.endReached).toBe(true);
  });
});

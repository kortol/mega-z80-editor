import { createContext } from "../../context";
import { NodePseudo } from "../../node";
import { handleConditional, isConditionActive } from "../conditional";

function makeNode(op: string, args: string[] = []): NodePseudo {
  return {
    kind: "pseudo",
    op,
    args: args.map((value) => ({ value })),
    pos: { file: "cond.asm", line: 0, phase: "analyze" },
  };
}

describe("conditional P2-M directives", () => {
  test("IF expression resolves case-insensitive symbols", () => {
    const ctx = createContext();
    ctx.caseInsensitive = true;
    ctx.symbols.set("POSTCCF", { value: 1, sectionId: 0, type: "CONST" });

    handleConditional(ctx, makeNode("IF", ["postccf"]));
    expect(isConditionActive(ctx)).toBe(true);
    handleConditional(ctx, makeNode("ENDIF"));
  });

  test("IFDEF / IFNDEF with symbol and extern", () => {
    const ctx = createContext();
    ctx.symbols.set("FOO", { value: 1, sectionId: 0, type: "CONST" });
    ctx.externs.add("EXT1");

    handleConditional(ctx, makeNode("IFDEF", ["FOO"]));
    expect(isConditionActive(ctx)).toBe(true);
    handleConditional(ctx, makeNode("ENDIF"));

    handleConditional(ctx, makeNode("IFDEF", ["EXT1"]));
    expect(isConditionActive(ctx)).toBe(true);
    handleConditional(ctx, makeNode("ENDIF"));

    handleConditional(ctx, makeNode("IFNDEF", ["BAR"]));
    expect(isConditionActive(ctx)).toBe(true);
    handleConditional(ctx, makeNode("ENDIF"));
  });

  test("IFB / IFNB with angle text", () => {
    const ctx = createContext();

    handleConditional(ctx, makeNode("IFB", ["<>"]));
    expect(isConditionActive(ctx)).toBe(true);
    handleConditional(ctx, makeNode("ENDIF"));

    handleConditional(ctx, makeNode("IFNB", ["<X>"]));
    expect(isConditionActive(ctx)).toBe(true);
    handleConditional(ctx, makeNode("ENDIF"));
  });

  test("IFDIF works as negated IFIDN", () => {
    const ctx = createContext();
    handleConditional(ctx, makeNode("IFDIF", ["<A>", "<B>"]));
    expect(isConditionActive(ctx)).toBe(true);
    handleConditional(ctx, makeNode("ENDIF"));
  });
});

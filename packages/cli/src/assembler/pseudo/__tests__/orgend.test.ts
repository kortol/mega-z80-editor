import { AsmContext, createContext, SourcePos } from "../../context";
import { handlePseudo } from "../../pseudo";
import { NodePseudo } from "../../node";

function makeCtx(): AsmContext {
  return createContext({ moduleName: "TEST" });
}

function makeNode(op: string, args: string[], pos: SourcePos = { line: 1, file: "test.asm", phase: "analyze" }): NodePseudo {
  return { kind: "pseudo", op, args: args.map(arg => ({ value: arg })), pos };
}

describe("pseudo - ORG/END", () => {
  describe("ORG", () => {
    test("ORG 100H sets loc=0x100", () => {
      const ctx = makeCtx();
      handlePseudo(ctx, makeNode("ORG", ["100H"]));
      expect(ctx.loc).toBe(0x100);
    });

    test("ORG 42 sets loc=42 (decimal)", () => {
      const ctx = makeCtx();
      handlePseudo(ctx, makeNode("ORG", ["42"]));
      expect(ctx.loc).toBe(42);
    });

    test("ORG 1010B sets loc=0b1010 (binary)", () => {
      const ctx = makeCtx();
      handlePseudo(ctx, makeNode("ORG", ["1010B"]));
      expect(ctx.loc).toBe(0b1010);
    });

    test("multiple ORG calls overwrite loc", () => {
      const ctx = makeCtx();
      handlePseudo(ctx, makeNode("ORG", ["$10"]));
      handlePseudo(ctx, makeNode("ORG", ["20H"]));
      expect(ctx.loc).toBe(0x20);
    });

    test("ORG can move backward in current section (M80 compatible)", () => {
      const ctx = makeCtx();
      handlePseudo(ctx, makeNode("ORG", ["200H"]));
      handlePseudo(ctx, makeNode("ORG", ["100H"]));
      expect(ctx.loc).toBe(0x100);
      expect(ctx.errors).toHaveLength(0);
    });

    test("ORG with invalid symbol throws", () => {
      const ctx = makeCtx();
      expect(() => handlePseudo(ctx, makeNode("ORG", ["FOO"])))
        .toThrow();
    });
  });

  describe("END", () => {
    test("END sets endReached=true", () => {
      const ctx = makeCtx();
      handlePseudo(ctx, makeNode("END", []));
      expect(ctx.endReached).toBe(true);
    });

    test("multiple END keeps endReached=true", () => {
      const ctx = makeCtx();
      handlePseudo(ctx, makeNode("END", []));
      handlePseudo(ctx, makeNode("END", []));
      expect(ctx.endReached).toBe(true);
    });

    test("END followed by ORG keeps endReached=true", () => {
      const ctx = makeCtx();
      handlePseudo(ctx, makeNode("END", []));
      handlePseudo(ctx, makeNode("ORG", ["200H"]));
      expect(ctx.endReached).toBe(true);
      expect(ctx.loc).toBe(0x200);
    });
  });
});

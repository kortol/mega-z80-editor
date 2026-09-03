import { AsmContext, createContext, SourcePos } from "../context";
import { handlePseudo } from "../pseudo";
import { NodePseudo } from "../node";
import { getLC, initCodegen } from "../codegen/emit";

function makeCtx(): AsmContext {
  const ctx = createContext({ moduleName: "TEST" });
  initCodegen(ctx, { withDefaultSections: true });
  return ctx;
}

function makeNode(op: string, args: string[], pos: SourcePos = { line: 1, file: "test.asm", phase: "analyze" }): NodePseudo {
  return { kind: "pseudo", op, args: args.map(arg => ({ value: arg })), pos };
}

describe("pseudo - dispatcher", () => {
  test("unknown pseudo throws", () => {
    const ctx = makeCtx();
    expect(() => handlePseudo(ctx, makeNode("FOOBAR", [])))
      .toThrow(/Unknown pseudo/);
  });

  test("ASxxxx dotted directives update module, exports, and sections", () => {
    const ctx = makeCtx();

    handlePseudo(ctx, makeNode(".MODULE", ["HELLO.I"]));
    handlePseudo(ctx, makeNode(".GLOBL", [".GCHAR", ".GINT"]));
    handlePseudo(ctx, makeNode(".AREA", ["_CODE"]));

    expect(ctx.moduleName).toBe("HELLO.I");
    expect(Array.from(ctx.exportSymbols)).toEqual([".GCHAR", ".GINT"]);
    expect(ctx.sections.get(ctx.currentSection)?.kind).toBe("TEXT");

    handlePseudo(ctx, makeNode(".AREA", ["_STACK"]));
    expect(ctx.sections.get(ctx.currentSection)?.kind).toBe("BSS");
    expect(getLC(ctx)).toBe(0);
  });
});

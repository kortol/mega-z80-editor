import { AsmContext, createContext, SourcePos } from "../context";
import { handlePseudo } from "../pseudo";
import { NodePseudo } from "../parser";
import { initCodegen } from "../codegen/emit";

function makeCtx(): AsmContext {
  const ctx = createContext({ moduleName: "TEST" });
  initCodegen(ctx, { withDefaultSections: true });
  return ctx;
}

function makeNode(op: string, args: string[], pos: SourcePos = { line: 1, file: "test.asm" }): NodePseudo {
  return { kind: "pseudo", op, args: args.map(arg => ({ value: arg })), pos };
}

describe("pseudo - dispatcher", () => {
  test("unknown pseudo throws", () => {
    const ctx = makeCtx();
    expect(() => handlePseudo(ctx, makeNode("FOOBAR", [])))
      .toThrow(/Unknown pseudo/);
  });
});

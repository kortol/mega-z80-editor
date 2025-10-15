import { AsmContext, createContext } from "../context";
import { handlePseudo } from "../pseudo";
import { NodePseudo } from "../parser";
import { initCodegen } from "../codegen/emit";

function makeCtx(): AsmContext {
  const ctx = createContext({ moduleName: "TEST" });
  initCodegen(ctx, { withDefaultSections: true });
  return ctx;
}

function makeNode(op: string, args: string[], line = 1): NodePseudo {
  return { kind: "pseudo", op, args: args.map(arg => ({ value: arg })), line };
}

describe("pseudo - dispatcher", () => {
  test("unknown pseudo throws", () => {
    const ctx = makeCtx();
    expect(() => handlePseudo(ctx, makeNode("FOOBAR", [])))
      .toThrow(/Unknown pseudo/);
  });
});

import { AsmContext } from "../context";
import { handlePseudo } from "../pseudo";
import { NodePseudo } from "../parser";

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

describe("pseudo - dispatcher", () => {
  test("unknown pseudo throws", () => {
    const ctx = makeCtx();
    expect(() => handlePseudo(ctx, makeNode("FOOBAR", [])))
      .toThrow(/Unknown pseudo/);
  });
});

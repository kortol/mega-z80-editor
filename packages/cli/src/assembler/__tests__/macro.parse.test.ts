import { parse } from "../parser";
import { createContext } from "../context";
import { tokenize } from "../tokenizer";

describe("macro parsing", () => {
  it("parses a simple MACRO/ENDM block", () => {
    const src = `
PRINT3 MACRO
  LD A,3
  LD B,2
  LD C,1
ENDM
`;
    const ctx = createContext({ inputFile: "test.asm" });
    const tokens = tokenize(ctx, src);
    const nodes = parse(ctx, tokens);

    const macro = nodes.find((n) => n.kind === "macroDef");
    expect(macro).toBeTruthy();
    expect((macro as any).name).toBe("PRINT3");
    expect((macro as any).bodyTokens.length).toBeGreaterThan(0);
  });

  it("throws error when ENDM is missing", () => {
    const src = `
FOO MACRO
  LD A,1
`;
    const ctx = createContext();
    const tokens = tokenize(ctx, src);
    expect(() => parse(ctx, tokens)).toThrow(/ENDM/);
  });
});

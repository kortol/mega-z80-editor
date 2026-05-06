import { createContext } from "../context";
import { parsePeg } from "../../assembler/parser/pegAdapter";

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
    const nodes = parsePeg(ctx, src);

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
    expect(() => parsePeg(ctx, src)).toThrow(/ENDM/);
  });
});

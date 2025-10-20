import { runAnalyze } from "../analyze";
import { createContext } from "../context";
import { expandMacros } from "../macro";
import { parse } from "../parser";
import { tokenize } from "../tokenizer";

describe("macro analyze", () => {
  it("registers macro definitions in context", () => {
    const src = `
PRINT3 MACRO
  LD A,3
  LD B,2
  LD C,1
ENDM
`;
    const ctx = createContext();
    const tokens = tokenize(ctx, src);
    const nodes = parse(ctx, tokens);
    ctx.nodes = nodes;
    expandMacros(ctx);   // ★ ここで展開
    runAnalyze(ctx);
    expect(ctx.macroTable.has("PRINT3")).toBe(true);
  });

  it("detects redefinition", () => {
    const src = `
PRINT3 MACRO
  LD A,1
ENDM
PRINT3 MACRO
  LD B,2
ENDM
`;
    const ctx = createContext();
    const tokens = tokenize(ctx, src);
    const nodes = parse(ctx, tokens);
    ctx.nodes = nodes;
    expandMacros(ctx);   // ★ ここで展開
    runAnalyze(ctx);
    const err = ctx.errors.find(e => e.code === "A7004");
    expect(err).toBeTruthy();
  });
});

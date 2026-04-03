"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const context_1 = require("../context");
const pegAdapter_1 = require("../../assembler/parser/pegAdapter");
describe("macro parsing", () => {
    it("parses a simple MACRO/ENDM block", () => {
        const src = `
PRINT3 MACRO
  LD A,3
  LD B,2
  LD C,1
ENDM
`;
        const ctx = (0, context_1.createContext)({ inputFile: "test.asm" });
        const nodes = (0, pegAdapter_1.parsePeg)(ctx, src);
        const macro = nodes.find((n) => n.kind === "macroDef");
        expect(macro).toBeTruthy();
        expect(macro.name).toBe("PRINT3");
        expect(macro.bodyTokens.length).toBeGreaterThan(0);
    });
    it("throws error when ENDM is missing", () => {
        const src = `
FOO MACRO
  LD A,1
`;
        const ctx = (0, context_1.createContext)();
        expect(() => (0, pegAdapter_1.parsePeg)(ctx, src)).toThrow(/ENDM/);
    });
});

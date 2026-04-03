"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const analyze_1 = require("../analyze");
const context_1 = require("../context");
const macro_1 = require("../macro");
const pegAdapter_1 = require("../../assembler/parser/pegAdapter");
describe("macro analyze", () => {
    it("registers macro definitions in context", () => {
        const src = `
PRINT3 MACRO
  LD A,3
  LD B,2
  LD C,1
ENDM
`;
        const ctx = (0, context_1.createContext)();
        const nodes = (0, pegAdapter_1.parsePeg)(ctx, src);
        ctx.nodes = nodes;
        (0, macro_1.expandMacros)(ctx); // ★ ここで展開
        (0, analyze_1.runAnalyze)(ctx);
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
        const ctx = (0, context_1.createContext)();
        const nodes = (0, pegAdapter_1.parsePeg)(ctx, src);
        ctx.nodes = nodes;
        (0, macro_1.expandMacros)(ctx); // 登録と再定義チェックがここで発生
        console.log(ctx);
        const err = ctx.errors.find(e => e.code === "A7004");
        expect(err).toBeTruthy(); // defineMacro内で検出    
    });
});

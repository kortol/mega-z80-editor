"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const context_1 = require("../../context");
const conditional_1 = require("../conditional");
function makeNode(op, args = []) {
    return {
        kind: "pseudo",
        op,
        args: args.map((value) => ({ value })),
        pos: { file: "cond.asm", line: 0, phase: "analyze" },
    };
}
describe("conditional P2-M directives", () => {
    test("IFDEF / IFNDEF with symbol and extern", () => {
        const ctx = (0, context_1.createContext)();
        ctx.symbols.set("FOO", { value: 1, sectionId: 0, type: "CONST" });
        ctx.externs.add("EXT1");
        (0, conditional_1.handleConditional)(ctx, makeNode("IFDEF", ["FOO"]));
        expect((0, conditional_1.isConditionActive)(ctx)).toBe(true);
        (0, conditional_1.handleConditional)(ctx, makeNode("ENDIF"));
        (0, conditional_1.handleConditional)(ctx, makeNode("IFDEF", ["EXT1"]));
        expect((0, conditional_1.isConditionActive)(ctx)).toBe(true);
        (0, conditional_1.handleConditional)(ctx, makeNode("ENDIF"));
        (0, conditional_1.handleConditional)(ctx, makeNode("IFNDEF", ["BAR"]));
        expect((0, conditional_1.isConditionActive)(ctx)).toBe(true);
        (0, conditional_1.handleConditional)(ctx, makeNode("ENDIF"));
    });
    test("IFB / IFNB with angle text", () => {
        const ctx = (0, context_1.createContext)();
        (0, conditional_1.handleConditional)(ctx, makeNode("IFB", ["<>"]));
        expect((0, conditional_1.isConditionActive)(ctx)).toBe(true);
        (0, conditional_1.handleConditional)(ctx, makeNode("ENDIF"));
        (0, conditional_1.handleConditional)(ctx, makeNode("IFNB", ["<X>"]));
        expect((0, conditional_1.isConditionActive)(ctx)).toBe(true);
        (0, conditional_1.handleConditional)(ctx, makeNode("ENDIF"));
    });
    test("IFDIF works as negated IFIDN", () => {
        const ctx = (0, context_1.createContext)();
        (0, conditional_1.handleConditional)(ctx, makeNode("IFDIF", ["<A>", "<B>"]));
        expect((0, conditional_1.isConditionActive)(ctx)).toBe(true);
        (0, conditional_1.handleConditional)(ctx, makeNode("ENDIF"));
    });
});

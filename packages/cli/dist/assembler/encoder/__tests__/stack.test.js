"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const context_1 = require("../../context");
const encoder_1 = require("../../encoder");
const emit_1 = require("../../codegen/emit");
function makeCtx() {
    const ctx = (0, context_1.createContext)({ moduleName: "TEST" });
    (0, emit_1.initCodegen)(ctx, { withDefaultSections: true });
    return ctx;
}
function makeNode(op, args, pos = { line: 1, file: "test.asm", phase: "analyze" }) {
    return { kind: "instr", op, args, pos };
}
describe("PUSH/POP instructions", () => {
    test("PUSH/POP BC", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("PUSH", ["BC"]));
        expect(ctx.texts[0].data).toEqual([0xc5]);
        ctx.texts = [];
        (0, encoder_1.encodeInstr)(ctx, makeNode("POP", ["BC"]));
        expect(ctx.texts[0].data).toEqual([0xc1]);
    });
    test("PUSH/POP AF", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("PUSH", ["AF"]));
        expect(ctx.texts[0].data).toEqual([0xf5]);
        ctx.texts = [];
        (0, encoder_1.encodeInstr)(ctx, makeNode("POP", ["AF"]));
        expect(ctx.texts[0].data).toEqual([0xf1]);
    });
    test("PUSH/POP IX", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("PUSH", ["IX"]));
        expect(ctx.texts[0].data).toEqual([0xdd, 0xe5]);
        ctx.texts = [];
        (0, encoder_1.encodeInstr)(ctx, makeNode("POP", ["IX"]));
        expect(ctx.texts[0].data).toEqual([0xdd, 0xe1]);
    });
});

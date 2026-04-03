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
describe("Misc", () => {
    test("NOP → 00", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("NOP", []));
        expect(ctx.texts[0].data).toEqual([0x00]);
    });
    test("HALT → 76", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("HALT", []));
        expect(ctx.texts[0].data).toEqual([0x76]);
    });
    test("DAA → 27", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("DAA", []));
        expect(ctx.texts[0].data).toEqual([0x27]);
    });
    test("CPL → 2F", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("CPL", []));
        expect(ctx.texts[0].data).toEqual([0x2f]);
    });
    test("SCF → 37", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("SCF", []));
        expect(ctx.texts[0].data).toEqual([0x37]);
    });
    test("CCF → 3F", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("CCF", []));
        expect(ctx.texts[0].data).toEqual([0x3f]);
    });
    test("DI → F3", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("DI", []));
        expect(ctx.texts[0].data).toEqual([0xf3]);
    });
    test("EI → FB", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("EI", []));
        expect(ctx.texts[0].data).toEqual([0xfb]);
    });
    test("RLCA → 07", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RLCA", []));
        expect(ctx.texts[0].data).toEqual([0x07]);
    });
    test("RRCA → 0F", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RRCA", []));
        expect(ctx.texts[0].data).toEqual([0x0f]);
    });
    test("RLA → 17", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RLA", []));
        expect(ctx.texts[0].data).toEqual([0x17]);
    });
    test("RRA → 1F", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RRA", []));
        expect(ctx.texts[0].data).toEqual([0x1f]);
    });
});

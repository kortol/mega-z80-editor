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
describe("IO instructions", () => {
    test("IN A,(12H) → DB 12", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("IN", ["A", "(12H)"]));
        expect(ctx.texts[0].data).toEqual([0xdb, 0x12]);
    });
    test("OUT (34H),A → D3 34", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("OUT", ["(34H)", "A"]));
        expect(ctx.texts[0].data).toEqual([0xd3, 0x34]);
    });
    test("IN B,(C) → ED 40", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("IN", ["B", "(C)"]));
        expect(ctx.texts[0].data).toEqual([0xed, 0x40]);
    });
    test("OUT (C),D → ED 51", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("OUT", ["(C)", "D"]));
        expect(ctx.texts[0].data).toEqual([0xed, 0x51]);
    });
    test("IN (C) → ED 70", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("IN", ["(C)"]));
        expect(ctx.texts[0].data).toEqual([0xed, 0x70]);
    });
    test("IN F,(C) → ED 70", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("IN", ["F", "(C)"]));
        expect(ctx.texts[0].data).toEqual([0xed, 0x70]);
    });
    test("OUT (C),0 → ED 71", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("OUT", ["(C)", "0"]));
        expect(ctx.texts[0].data).toEqual([0xed, 0x71]);
    });
    test("IN B,(12H) is rejected (only A allowed)", () => {
        const ctx = makeCtx();
        expect(() => (0, encoder_1.encodeInstr)(ctx, makeNode("IN", ["B", "(12H)"]))).toThrow(/only IN A,\(n\) is supported/);
    });
    test("OUT (12H),B is rejected (only A allowed)", () => {
        const ctx = makeCtx();
        expect(() => (0, encoder_1.encodeInstr)(ctx, makeNode("OUT", ["(12H)", "B"]))).toThrow(/only OUT \(n\),A is supported/);
    });
    test("OUT (C),1 is rejected (only 0 allowed)", () => {
        const ctx = makeCtx();
        expect(() => (0, encoder_1.encodeInstr)(ctx, makeNode("OUT", ["(C)", "1"]))).toThrow(/only 0 is supported/);
    });
});

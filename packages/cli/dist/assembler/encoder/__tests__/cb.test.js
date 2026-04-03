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
describe("CB prefix", () => {
    // --- Rotate/Shift ---
    test("RRC A → CB 0F", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RRC", ["A"]));
        expect(ctx.texts[0].data).toEqual([0xcb, 0x0f]);
    });
    test("RL (HL) → CB 16", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RL", ["(HL)"]));
        expect(ctx.texts[0].data).toEqual([0xcb, 0x16]);
    });
    test("RR E → CB 1B", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RR", ["E"]));
        expect(ctx.texts[0].data).toEqual([0xcb, 0x1b]);
    });
    test("SRA H → CB 2C", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("SRA", ["H"]));
        expect(ctx.texts[0].data).toEqual([0xcb, 0x2c]);
    });
    test("SLL L → CB 35", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("SLL", ["L"]));
        expect(ctx.texts[0].data).toEqual([0xcb, 0x35]);
    });
    test("RLC B → CB 00", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RLC", ["B"]));
        expect(ctx.texts[0].data).toEqual([0xcb, 0x00]);
    });
    test("SLA C → CB 21", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("SLA", ["C"]));
        expect(ctx.texts[0].data).toEqual([0xcb, 0x21]);
    });
    test("SRL D → CB 3A", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("SRL", ["D"]));
        expect(ctx.texts[0].data).toEqual([0xcb, 0x3a]);
    });
    // --- BIT/RES/SET ---
    test("BIT 0,B → CB 40", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("BIT", ["0", "B"]));
        expect(ctx.texts[0].data).toEqual([0xcb, 0x40]);
    });
    test("BIT 7,H → CB 7C", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("BIT", ["7", "H"]));
        expect(ctx.texts[0].data).toEqual([0xcb, 0x7c]);
    });
    test("SET 0,L → CB C5", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("SET", ["0", "L"]));
        expect(ctx.texts[0].data).toEqual([0xcb, 0xc5]);
    });
    test("RES 1,A → CB 8F", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RES", ["1", "A"]));
        expect(ctx.texts[0].data).toEqual([0xcb, 0x8f]);
    });
    test("BIT 8,A is rejected", () => {
        const ctx = makeCtx();
        expect(() => (0, encoder_1.encodeInstr)(ctx, makeNode("BIT", ["8", "A"]))).toThrow(/bit index out of range/);
    });
    test("RLC (BC) is rejected", () => {
        const ctx = makeCtx();
        expect(() => (0, encoder_1.encodeInstr)(ctx, makeNode("RLC", ["(BC)"]))).toThrow(/Invalid 8bit register/);
    });
});

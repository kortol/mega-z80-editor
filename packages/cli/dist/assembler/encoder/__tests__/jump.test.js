"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const context_1 = require("../../context");
const encoder_1 = require("../../encoder");
const emit_1 = require("../../codegen/emit");
function makeCtx() {
    const ctx = (0, context_1.createContext)({ moduleName: "TEST", phase: "emit" });
    (0, emit_1.initCodegen)(ctx, { withDefaultSections: true });
    return ctx;
}
function makeNode(op, args, pos = { line: 1, file: "test.asm", phase: "analyze" }) {
    return { kind: "instr", op, args, pos };
}
describe("Jump/Call/Return", () => {
    test("CALL 1234 → CD 34 12", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("CALL", ["1234"]));
        expect(ctx.texts[0].data).toEqual([0xcd, 0xd2, 0x04]);
    });
    test("CALL BDOS → unresolved", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("CALL", ["BDOS"]));
        expect(ctx.texts[0].data).toEqual([0xcd, 0x00, 0x00]);
        expect(ctx.unresolved).toEqual([{
                addr: 1, symbol: "BDOS", size: 2, addend: 0, requester: {
                    op: "ENCODER", phase: "assemble", pos: { line: 1, file: "test.asm", phase: "analyze" }
                }
            }]);
    });
    test("JR forward offset", () => {
        const ctx = makeCtx();
        // loc = 0 の状態で "JR 10" は → offset = 10 - (0+2) = 8
        (0, encoder_1.encodeInstr)(ctx, makeNode("JR", ["10"]));
        expect(ctx.texts[0].data).toEqual([0x18, 0x08]);
    });
    test("JR backward offset", () => {
        const ctx = makeCtx();
        ctx.loc = 0x20;
        // "JR 0x10" → offset = 0x10 - (0x20+2) = -0x12 (signed)
        (0, encoder_1.encodeInstr)(ctx, makeNode("JR", ["16"]));
        expect(ctx.texts[0].data).toEqual([0x18, 0xee]); // -18 = 0xEE
    });
    test("JP 1234H → C3 34 12", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("JP", ["1234H"]));
        expect(ctx.texts[0].data).toEqual([0xc3, 0x34, 0x12]);
    });
    test("JP Z,1234H → CA 34 12", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("JP", ["Z", "1234H"]));
        expect(ctx.texts[0].data).toEqual([0xca, 0x34, 0x12]);
    });
    test("JR 10 → 18 08", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("JR", ["10"]));
        expect(ctx.texts[0].data).toEqual([0x18, 0x08]);
    });
    test("JR NZ,10 → 20 08", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("JR", ["NZ", "10"]));
        expect(ctx.texts[0].data).toEqual([0x20, 0x08]);
    });
    test("JR (HL) is rejected", () => {
        const ctx = makeCtx();
        expect(() => (0, encoder_1.encodeInstr)(ctx, makeNode("JR", ["(HL)"]))).toThrow(/Unsupported JR form/);
    });
    test("CALL 1234H → CD 34 12", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("CALL", ["1234H"]));
        expect(ctx.texts[0].data).toEqual([0xcd, 0x34, 0x12]);
    });
    test("CALL (HL) is rejected", () => {
        const ctx = makeCtx();
        expect(() => (0, encoder_1.encodeInstr)(ctx, makeNode("CALL", ["(HL)"]))).toThrow(/Unsupported CALL form/);
    });
    test("RET → C9", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RET", []));
        expect(ctx.texts[0].data).toEqual([0xc9]);
    });
    test("RET Z → C8", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RET", ["Z"]));
        expect(ctx.texts[0].data).toEqual([0xc8]);
    });
    test("RST 38H → FF", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RST", ["38H"]));
        expect(ctx.texts[0].data).toEqual([0xff]);
    });
    test("JP (HL) → E9", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("JP", ["(HL)"]));
        expect(ctx.texts[0].data).toEqual([0xe9]);
    });
    test("JP A is rejected", () => {
        const ctx = makeCtx();
        expect(() => (0, encoder_1.encodeInstr)(ctx, makeNode("JP", ["A"]))).toThrow(/Unsupported JP form/);
    });
    test("JP (IX) → DD E9", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("JP", ["(IX)"]));
        expect(ctx.texts[0].data).toEqual([0xdd, 0xe9]);
    });
    test("DJNZ 20H → 10 1E", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("DJNZ", ["20H"]));
        expect(ctx.texts[0].data).toEqual([0x10, 0x1e]);
    });
    test("CALL Z,1234H → CC 34 12", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("CALL", ["Z", "1234H"]));
        expect(ctx.texts[0].data).toEqual([0xcc, 0x34, 0x12]);
    });
    test("RET NC → D0", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("RET", ["NC"]));
        expect(ctx.texts[0].data).toEqual([0xd0]);
    });
});

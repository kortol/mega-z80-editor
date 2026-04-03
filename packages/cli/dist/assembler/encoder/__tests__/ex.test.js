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
describe("EX/EXX encodeInstr", () => {
    it("EX AF,AF' → 08", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("EX", ["AF", "AF'"]));
        expect(ctx.texts[0].data).toEqual([0x08]);
    });
    it("EX DE,HL → EB", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("EX", ["DE", "HL"]));
        expect(ctx.texts[0].data).toEqual([0xeb]);
    });
    it("EX (SP),HL → E3", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("EX", ["(SP)", "HL"]));
        expect(ctx.texts[0].data).toEqual([0xe3]);
    });
    it("EX (SP),IX → DD E3", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("EX", ["(SP)", "IX"]));
        expect(ctx.texts[0].data).toEqual([0xdd, 0xe3]);
    });
    it("EX (SP),IY → FD E3", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("EX", ["(SP)", "IY"]));
        expect(ctx.texts[0].data).toEqual([0xfd, 0xe3]);
    });
    it("EXX → D9", () => {
        const ctx = makeCtx();
        (0, encoder_1.encodeInstr)(ctx, makeNode("EXX", []));
        expect(ctx.texts[0].data).toEqual([0xd9]);
    });
});

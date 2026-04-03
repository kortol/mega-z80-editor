"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const emit_1 = require("../codegen/emit");
const context_1 = require("../context");
const rel_1 = require("../rel");
function makeCtx() {
    const ctx = (0, context_1.createContext)({ moduleName: "HELLO" });
    (0, emit_1.initCodegen)(ctx, { withDefaultSections: true });
    return ctx;
}
describe("rel emitter", () => {
    test("minimal H record only", () => {
        const ctx = makeCtx();
        const rel = (0, rel_1.emitRel)(ctx);
        expect(rel).toBe("H HELLO");
    });
    test("T record with data", () => {
        const ctx = makeCtx();
        ctx.texts.push({ addr: 0x0100, data: [0x3E, 0x41], pos: { line: 0, file: "test.asm", phase: "emit" } }); // LD A,'A'
        const rel = (0, rel_1.emitRel)(ctx).split("\n");
        expect(rel).toContain("H HELLO");
        expect(rel).toContain("T 0100 3E 41");
    });
    test("S record with symbol", () => {
        const ctx = makeCtx();
        (0, context_1.defineSymbol)(ctx, "FOO", 0x1234, "LABEL");
        const rel = (0, rel_1.emitRel)(ctx).split("\n");
        expect(rel).toContain("S FOO 1234");
    });
    test("R record unresolved", () => {
        const ctx = makeCtx();
        ctx.unresolved.push({
            addr: 0x0200, symbol: "BDOS", size: 2, requester: {
                op: "ENCODER",
                phase: "assemble",
                pos: { line: 0, file: "test.asm", phase: "emit" }
            },
        });
        const rel = (0, rel_1.emitRel)(ctx).split("\n");
        expect(rel).toContain("R 0200 BDOS");
    });
    test("E record entry", () => {
        const ctx = makeCtx();
        ctx.entry = 0x0100;
        const rel = (0, rel_1.emitRel)(ctx).split("\n");
        expect(rel).toContain("E 0100");
    });
    test("combined case", () => {
        const ctx = makeCtx();
        ctx.texts.push({ addr: 0x0000, data: [0xCD, 0x05, 0x00], pos: { line: 0, file: "test.asm", phase: "emit" } }); // CALL 0005h
        (0, context_1.defineSymbol)(ctx, "START", 0x0000, "LABEL");
        ctx.unresolved.push({
            addr: 0x0001, symbol: "BDOS", size: 2, requester: {
                op: "ENCODER",
                phase: "assemble",
                pos: { line: 0, file: "test.asm", phase: "emit" }
            },
        });
        ctx.entry = 0x0000;
        const rel = (0, rel_1.emitRel)(ctx).split("\n");
        expect(rel).toContain("H HELLO");
        expect(rel).toContain("T 0000 CD 05 00");
        expect(rel).toContain("S START 0000");
        expect(rel).toContain("R 0001 BDOS");
        expect(rel).toContain("E 0000");
    });
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const context_1 = require("../../context");
const end_1 = require("../end");
const builder_1 = require("../../rel/builder");
const adapter_1 = require("../../rel/adapter");
const errors_1 = require("../../errors");
const pegAdapter_1 = require("../../../assembler/parser/pegAdapter");
function makeCtx() {
    return (0, context_1.createContext)({ moduleName: "TEST" });
}
function assemble(ctx, src) {
    const nodes = (0, pegAdapter_1.parsePeg)(ctx, src);
    for (const node of nodes) {
        if (node.kind === "pseudo" && node.op === "END") {
            (0, end_1.handleEND)(ctx, node);
        }
    }
    return ctx;
}
describe("END pseudo", () => {
    test("END無し → Eレコードなし", () => {
        const ctx = makeCtx();
        ctx.texts.push({ addr: 0x100, data: [0x3E, 0x01], pos: { line: 1, file: "test.asm", phase: "emit" } });
        const file = (0, builder_1.buildRelFile)(ctx);
        const out = new adapter_1.TextRelAdapter().write(file);
        expect(out).not.toMatch(/^E/);
    });
    test("ENDのみ → Eレコードなし", () => {
        const ctx = makeCtx();
        assemble(ctx, "END");
        const file = (0, builder_1.buildRelFile)(ctx);
        const out = new adapter_1.TextRelAdapter().write(file);
        expect(out).not.toMatch(/^E/);
    });
    test("END expr → Eレコードあり", () => {
        const ctx = makeCtx();
        assemble(ctx, "END 1234H");
        const file = (0, builder_1.buildRelFile)(ctx);
        const out = new adapter_1.TextRelAdapter().write(file);
        expect(out).toContain("E 1234");
    });
    test("END extern → エラー", () => {
        const ctx = makeCtx();
        assemble(ctx, "END EXT");
        expect(ctx.errors.length).toBeGreaterThan(0);
        expect(ctx.errors[0].code).toBe(errors_1.AssemblerErrorCode.ExprExternInEnd);
    });
});

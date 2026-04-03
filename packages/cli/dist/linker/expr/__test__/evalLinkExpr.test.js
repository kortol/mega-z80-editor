"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/__tests__/linker/expr/evalLinkExpr.test.ts
const mockContext_1 = require("./mockContext");
const evalLinkExpr_1 = require("../evalLinkExpr");
describe("P1-F: evalLinkExpr (with LinkResolveContext)", () => {
    const ctx = (0, mockContext_1.createMockContext)();
    const resolver = (name, context = ctx) => {
        if (context.symbols.has(name)) {
            return { kind: "defined", addr: context.symbols.get(name).addr };
        }
        else if (context.externs?.has(name)) {
            return { kind: "extern" };
        }
        else {
            return { kind: "unknown" };
        }
    };
    it("evaluates decimal constant", () => {
        const res = (0, evalLinkExpr_1.evalLinkExpr)("1234", resolver);
        expect(res.ok).toBe(true);
        expect(res.value).toBe(0x04D2);
    });
    it("evaluates hex constant (1FH)", () => {
        const res = (0, evalLinkExpr_1.evalLinkExpr)("1FH", resolver);
        expect(res.ok).toBe(true);
        expect(res.value).toBe(0x1F);
    });
    it("resolves defined symbol", () => {
        const res = (0, evalLinkExpr_1.evalLinkExpr)("FOO", resolver);
        expect(res.ok).toBe(true);
        expect(res.value).toBe(0x200);
    });
    it("resolves symbol +4", () => {
        const res = (0, evalLinkExpr_1.evalLinkExpr)("FOO+4", resolver);
        expect(res.ok).toBe(true);
        expect(res.value).toBe(0x204);
    });
    it("resolves symbol -2", () => {
        const res = (0, evalLinkExpr_1.evalLinkExpr)("BAR-2", resolver);
        expect(res.ok).toBe(true);
        expect(res.value).toBe(0x2FE);
    });
    it("returns unresolved for extern symbol", () => {
        const res = (0, evalLinkExpr_1.evalLinkExpr)("BAZ", resolver);
        expect(res.ok).toBe(false);
        expect(res.unresolved).toContain("BAZ");
    });
    it("returns error for unsupported expression", () => {
        const res = (0, evalLinkExpr_1.evalLinkExpr)("A+B-4", resolver);
        expect(res.ok).toBe(false);
        expect(res.errors?.[0]).toMatch(/Unsupported/);
    });
    it("returns error for empty expression", () => {
        const res = (0, evalLinkExpr_1.evalLinkExpr)(" ", resolver);
        expect(res.ok).toBe(false);
        expect(res.errors?.[0]).toMatch(/Empty/);
    });
    it("wraps around 16-bit overflow", () => {
        const res = (0, evalLinkExpr_1.evalLinkExpr)("0xFFFF+2", resolver);
        expect(res.ok).toBe(true);
        expect(res.value).toBe(1);
    });
});

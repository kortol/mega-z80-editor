"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const eval_1 = require("../eval");
const errors_1 = require("../../errors");
function makeCtx() {
    return {
        symbols: new Map([["FOO", 100]]),
        externs: new Set(["EXT"]),
        pass: 2,
        errors: [],
        visiting: new Set(),
        loc: 0,
    };
}
describe("evalExpr", () => {
    test("const expression 1+2*3", () => {
        const expr = {
            kind: "Binary",
            op: "+",
            left: { kind: "Const", value: 1 },
            right: {
                kind: "Binary",
                op: "*",
                left: { kind: "Const", value: 2 },
                right: { kind: "Const", value: 3 },
            },
        };
        const ctx = makeCtx();
        const res = (0, eval_1.evalExpr)(expr, ctx);
        expect(res).toEqual({ kind: "Const", value: 7 });
        expect(ctx.errors).toHaveLength(0);
    });
    test("unary -5", () => {
        const expr = {
            kind: "Unary",
            op: "-",
            expr: { kind: "Const", value: 5 },
        };
        const ctx = makeCtx();
        const res = (0, eval_1.evalExpr)(expr, ctx);
        expect(res).toEqual({ kind: "Const", value: -5 });
    });
    test("symbol reference (defined)", () => {
        const expr = { kind: "Symbol", name: "FOO" };
        const ctx = makeCtx();
        const res = (0, eval_1.evalExpr)(expr, ctx);
        expect(res).toEqual({ kind: "Const", value: 100 });
    });
    test("symbol reference (extern)", () => {
        const expr = { kind: "Symbol", name: "EXT" };
        const ctx = makeCtx();
        const res = (0, eval_1.evalExpr)(expr, ctx);
        expect(res).toEqual({ kind: "Reloc", sym: "EXT", addend: 0 });
    });
    test("symbol reference (undefined)", () => {
        const expr = { kind: "Symbol", name: "UNDEF" };
        const ctx = makeCtx();
        const res = (0, eval_1.evalExpr)(expr, ctx);
        expect(res).toEqual({ kind: "Reloc", sym: "UNDEF", addend: 0 });
        expect(ctx.errors[0].code).toBe(errors_1.AssemblerErrorCode.ExprUndefinedSymbol);
    });
    test("extern + const", () => {
        const expr = {
            kind: "Binary",
            op: "+",
            left: { kind: "Symbol", name: "EXT" },
            right: { kind: "Const", value: 5 },
        };
        const ctx = makeCtx();
        const res = (0, eval_1.evalExpr)(expr, ctx);
        expect(res).toEqual({ kind: "Reloc", sym: "EXT", addend: 5 });
    });
    test("const - extern (invalid)", () => {
        const expr = {
            kind: "Binary",
            op: "-",
            left: { kind: "Const", value: 1 },
            right: { kind: "Symbol", name: "EXT" },
        };
        const ctx = makeCtx();
        (0, eval_1.evalExpr)(expr, ctx);
        expect(ctx.errors[0].code).toBe(errors_1.AssemblerErrorCode.ExprConstMinusExtern);
    });
    test("extern - extern (invalid)", () => {
        const expr = {
            kind: "Binary",
            op: "-",
            left: { kind: "Symbol", name: "EXT" },
            right: { kind: "Symbol", name: "EXT" },
        };
        const ctx = makeCtx();
        (0, eval_1.evalExpr)(expr, ctx);
        expect(ctx.errors[0].code).toBe(errors_1.AssemblerErrorCode.ExprExternArithmetic);
    });
    test("division by zero", () => {
        const expr = {
            kind: "Binary",
            op: "/",
            left: { kind: "Const", value: 1 },
            right: { kind: "Const", value: 0 },
        };
        const ctx = makeCtx();
        (0, eval_1.evalExpr)(expr, ctx);
        expect(ctx.errors[0].code).toBe(errors_1.AssemblerErrorCode.ExprDivideByZero);
    });
    test("modulo by zero", () => {
        const expr = {
            kind: "Binary",
            op: "%",
            left: { kind: "Const", value: 1 },
            right: { kind: "Const", value: 0 },
        };
        const ctx = makeCtx();
        (0, eval_1.evalExpr)(expr, ctx);
        expect(ctx.errors[0].code).toBe(errors_1.AssemblerErrorCode.ExprDivideByZero);
    });
    test("Infinity in multiplication", () => {
        const expr = {
            kind: "Binary",
            op: "*",
            left: { kind: "Const", value: Number.MAX_VALUE },
            right: { kind: "Const", value: 2 },
        };
        const ctx = makeCtx();
        const res = (0, eval_1.evalExpr)(expr, ctx);
        expect(res).toEqual({ kind: "Const", value: 0 });
        expect(ctx.errors[0].code).toBe(errors_1.AssemblerErrorCode.ExprNaN);
    });
    test("NaN in multiplication", () => {
        const expr = {
            kind: "Binary",
            op: "*",
            left: { kind: "Const", value: NaN },
            right: { kind: "Const", value: 2 },
        };
        const ctx = makeCtx();
        const res = (0, eval_1.evalExpr)(expr, ctx);
        expect(res).toEqual({ kind: "Const", value: 0 });
        expect(ctx.errors[0].code).toBe(errors_1.AssemblerErrorCode.ExprNaN);
    });
    test("direct circular EQU", () => {
        const ctx = makeCtx();
        // FOO EQU FOO+1
        ctx.symbols.set("FOO", {
            kind: "Binary",
            op: "+",
            left: { kind: "Symbol", name: "FOO" },
            right: { kind: "Const", value: 1 },
        });
        (0, eval_1.evalExpr)({ kind: "Symbol", name: "FOO" }, ctx);
        expect(ctx.errors[0].code).toBe(errors_1.AssemblerErrorCode.ExprCircularRef);
    });
    test("indirect circular EQU", () => {
        const ctx = makeCtx();
        ctx.symbols.set("A", {
            kind: "Binary",
            op: "+",
            left: { kind: "Symbol", name: "B" },
            right: { kind: "Const", value: 1 },
        });
        ctx.symbols.set("B", {
            kind: "Binary",
            op: "+",
            left: { kind: "Symbol", name: "A" },
            right: { kind: "Const", value: 1 },
        });
        (0, eval_1.evalExpr)({ kind: "Symbol", name: "A" }, ctx);
        expect(ctx.errors[0].code).toBe(errors_1.AssemblerErrorCode.ExprCircularRef);
    });
    test("ORG self reference", () => {
        const ctx = makeCtx();
        // ORG START ; START: ...
        ctx.symbols.set("START", { kind: "Symbol", name: "START" });
        (0, eval_1.evalExpr)({ kind: "Symbol", name: "START" }, ctx);
        expect(ctx.errors[0].code).toBe(errors_1.AssemblerErrorCode.ExprCircularRef);
    });
});

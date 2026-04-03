"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const context_1 = require("../../context");
const tokenizer_1 = require("../../tokenizer");
const eval_1 = require("../eval");
const parserExpr_1 = require("../parserExpr");
function parseE(ctx, src) {
    const toks = (0, tokenizer_1.tokenize)(ctx, src).filter((t) => t.kind !== "eol");
    return (0, parserExpr_1.parseExpr)(toks);
}
function makeCtx() {
    return (0, context_1.createContext)({ moduleName: "TEST" });
}
function makeEvalCtx() {
    return {
        symbols: new Map([]),
        externs: new Set(),
        pass: 2,
        errors: [],
        visiting: new Set(),
        loc: 0,
    };
}
describe("parserExpr", () => {
    test("1+2*3", () => {
        const ctx = makeCtx();
        const e = parseE(ctx, "1+2*3");
        expect(e).toEqual({
            kind: "Binary",
            op: "+",
            left: { kind: "Const", value: 1 },
            right: {
                kind: "Binary",
                op: "*",
                left: { kind: "Const", value: 2 },
                right: { kind: "Const", value: 3 },
            },
        });
        expect((0, eval_1.evalExpr)(e, makeEvalCtx())).toEqual({ kind: "Const", value: 7 });
    });
    test("1*2+3", () => {
        const ctx = makeCtx();
        const e = parseE(ctx, "1*2+3");
        expect(e).toEqual({
            kind: "Binary",
            op: "+",
            left: {
                kind: "Binary",
                op: "*",
                left: { kind: "Const", value: 1 },
                right: { kind: "Const", value: 2 },
            },
            right: { kind: "Const", value: 3 },
        });
        expect((0, eval_1.evalExpr)(e, makeEvalCtx())).toEqual({ kind: "Const", value: 5 });
    });
    test("-(1+2)", () => {
        const ctx = makeCtx();
        const e = parseE(ctx, "-(1+2)");
        expect(e).toEqual({
            kind: "Unary",
            op: "-",
            expr: {
                kind: "Binary",
                op: "+",
                left: { kind: "Const", value: 1 },
                right: { kind: "Const", value: 2 },
            },
        });
        expect((0, eval_1.evalExpr)(e, makeEvalCtx())).toEqual({ kind: "Const", value: -3 });
    });
    test("101%5", () => {
        const ctx = makeCtx();
        const e = parseE(ctx, "101%5");
        expect(e).toEqual({
            kind: "Binary",
            op: "%",
            left: { kind: "Const", value: 101 },
            right: { kind: "Const", value: 5 },
        });
        expect((0, eval_1.evalExpr)(e, makeEvalCtx())).toEqual({ kind: "Const", value: 1 });
    });
    test("FOO+10", () => {
        const ctx = makeCtx();
        const e = parseE(ctx, "FOO+10");
        expect(e).toEqual({
            kind: "Binary",
            op: "+",
            left: { kind: "Symbol", name: "FOO" },
            right: { kind: "Const", value: 10 },
        });
        expect((0, eval_1.evalExpr)(e, makeEvalCtx())).toEqual({
            kind: "Reloc",
            sym: "FOO",
            addend: 10,
        });
    });
    test("nested precedence: (1+2)*3", () => {
        const ctx = makeCtx();
        const e = parseE(ctx, "(1+2)*3");
        expect(e).toEqual({
            kind: "Binary",
            op: "*",
            left: {
                kind: "Binary",
                op: "+",
                left: { kind: "Const", value: 1 },
                right: { kind: "Const", value: 2 },
            },
            right: { kind: "Const", value: 3 },
        });
    });
    test("unary plus", () => {
        const ctx = makeCtx();
        const e = parseE(ctx, "+5");
        expect(e).toEqual({
            kind: "Unary",
            op: "+",
            expr: { kind: "Const", value: 5 },
        });
    });
    test("bitwise and/or/xor", () => {
        const ctx = makeCtx();
        const e = parseE(ctx, "1|2&3^4");
        // precedence (compat): ^ > & > |
        expect((0, eval_1.evalExpr)(e, makeEvalCtx())).toEqual({ kind: "Const", value: 1 | (2 & (3 ^ 4)) });
    });
    test("bitwise precedence guard: ^ > &", () => {
        const ctx = makeCtx();
        const e = parseE(ctx, "1^2&4");
        // if ^ > &: (1^2)=3, 3&4=0
        expect((0, eval_1.evalExpr)(e, makeEvalCtx())).toEqual({ kind: "Const", value: 0 });
    });
    test("shift and compare", () => {
        const ctx = makeCtx();
        const e = parseE(ctx, "1+2<<3 == 24");
        expect((0, eval_1.evalExpr)(e, makeEvalCtx())).toEqual({ kind: "Const", value: 1 });
    });
    test("unary not and bitwise not", () => {
        const ctx = makeCtx();
        const e1 = parseE(ctx, "!0");
        expect((0, eval_1.evalExpr)(e1, makeEvalCtx())).toEqual({ kind: "Const", value: 1 });
        const e2 = parseE(ctx, "~0");
        expect((0, eval_1.evalExpr)(e2, makeEvalCtx())).toEqual({ kind: "Const", value: -1 });
    });
    test("invalid: 1+", () => {
        const ctx = makeCtx();
        expect(() => parseE(ctx, "1+")).toThrow(/Unexpected/);
    });
    test("invalid: )", () => {
        const ctx = makeCtx();
        expect(() => parseE(ctx, ")")).toThrow(/Syntax error/);
    });
});

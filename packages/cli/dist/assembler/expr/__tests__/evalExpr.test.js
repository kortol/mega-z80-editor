"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const context_1 = require("../../context");
const tokenizer_1 = require("../../tokenizer");
const eval_1 = require("../eval");
const parserExpr_1 = require("../parserExpr");
function formatResult(res) {
    // console.log(res);
    if (res.kind === "Const")
        return `const(${res.value})`;
    if (res.kind === "Reloc")
        return `extern(${res.sym}+${res.addend})`;
    if (res.kind === "Error")
        return `error(${res.message})`;
    return "unknown";
}
describe("evalExpr", () => {
    let ctx;
    let ec;
    beforeEach(() => {
        ctx = (0, context_1.createContext)({ moduleName: "TEST" });
        ec = {
            symbols: new Map(),
            externs: new Set(),
            pass: 1,
            errors: [],
            visiting: new Set(),
            loc: 0,
        };
        ec.symbols.set("FOO", 10);
        ec.symbols.set("BAR", 20);
        ec.symbols.set("ZERO", 0);
        ec.externs.add("EXT");
        ec.externs.add("EXT1");
        ec.externs.add("EXT2");
        return ec;
    });
    function parseE(ctx, expr) {
        const token = (0, tokenizer_1.tokenize)(ctx, expr).filter(t => t.kind !== "eol");
        const e = (0, parserExpr_1.parseExpr)(token);
        return e;
    }
    describe("内部シンボル同士", () => {
        test("FOO+BAR => const(30)", () => {
            expect(formatResult((0, eval_1.evalExpr)(parseE(ctx, "FOO+BAR"), ec))).toBe("const(30)");
        });
        test("FOO-BAR => const(-10)", () => {
            expect(formatResult((0, eval_1.evalExpr)(parseE(ctx, "FOO-BAR"), ec))).toBe("const(-10)");
        });
        test("FOO*BAR => const(200)", () => {
            expect(formatResult((0, eval_1.evalExpr)(parseE(ctx, "FOO*BAR"), ec))).toBe("const(200)");
        });
        test("BAR/FOO => const(2)", () => {
            expect(formatResult((0, eval_1.evalExpr)(parseE(ctx, "BAR/FOO"), ec))).toBe("const(2)");
        });
        test("除算ゼロ => error", () => {
            expect((0, eval_1.evalExpr)(parseE(ctx, "FOO/ZERO"), ec).kind).toBe("Error");
        });
    });
    describe("外部シンボル単独", () => {
        test("EXT => extern(EXT+0)", () => {
            expect(formatResult((0, eval_1.evalExpr)(parseE(ctx, "EXT"), ec))).toBe("extern(EXT+0)");
        });
        test("-EXT => error", () => {
            expect((0, eval_1.evalExpr)(parseE(ctx, "-EXT"), ec).kind).toBe("Error");
        });
        test("2*EXT => error", () => {
            expect((0, eval_1.evalExpr)(parseE(ctx, "2*EXT"), ec).kind).toBe("Error");
        });
    });
    describe("外部＋定数", () => {
        test("EXT+1 => extern(EXT+1)", () => {
            expect(formatResult((0, eval_1.evalExpr)(parseE(ctx, "EXT+1"), ec))).toBe("extern(EXT+1)");
        });
        test("1+EXT => extern(EXT+1)", () => {
            expect(formatResult((0, eval_1.evalExpr)(parseE(ctx, "1+EXT"), ec))).toBe("extern(EXT+1)");
        });
        test("EXT-1 => extern(EXT+-1)", () => {
            expect(formatResult((0, eval_1.evalExpr)(parseE(ctx, "EXT-1"), ec))).toBe("extern(EXT+-1)");
        });
        test("5-EXT => error", () => {
            expect((0, eval_1.evalExpr)(parseE(ctx, "5-EXT"), ec).kind).toBe("Error");
        });
    });
    describe("外部＋内部", () => {
        test("EXT+FOO => extern(EXT+10)", () => {
            expect(formatResult((0, eval_1.evalExpr)(parseE(ctx, "EXT+FOO"), ec))).toBe("extern(EXT+10)");
        });
        test("FOO+EXT => extern(EXT+10)", () => {
            expect(formatResult((0, eval_1.evalExpr)(parseE(ctx, "FOO+EXT"), ec))).toBe("extern(EXT+10)");
        });
        test("EXT-FOO => extern(EXT+-10)", () => {
            expect(formatResult((0, eval_1.evalExpr)(parseE(ctx, "EXT-FOO"), ec))).toBe("extern(EXT+-10)");
        });
        test("FOO-EXT => error", () => {
            expect((0, eval_1.evalExpr)(parseE(ctx, "FOO-EXT"), ec).kind).toBe("Error");
        });
        test("EXT+BAR (未定義) => error", () => {
            expect((0, eval_1.evalExpr)(parseE(ctx, "EXT+BAR2"), ec).kind).toBe("Error");
        });
    });
    describe("外部が2つ以上", () => {
        test("EXT1+EXT2 => error", () => {
            expect((0, eval_1.evalExpr)(parseE(ctx, "EXT1+EXT2"), ec).kind).toBe("Error");
        });
        test("EXT1-EXT2 => error", () => {
            expect((0, eval_1.evalExpr)(parseE(ctx, "EXT1-EXT2"), ec).kind).toBe("Error");
        });
    });
});

import { AsmContext } from "../../context";
import { handlePseudo } from "../../pseudo";
import { NodePseudo } from "../../parser";

function makeCtx(): AsmContext {
    return {
        loc: 0,
        moduleName: "TEST",
        symbols: new Map(),
        unresolved: [],
        modeWord32: false,
        modeSymLen: 6,
        caseInsensitive: true,
        texts: [],
    };
}

function makeNode(op: string, args: string[], line = 1): NodePseudo {
    return { kind: "pseudo", op, args, line };
}

describe("pseudo - EQU", () => {
    test("basic EQU registers symbol", () => {
        const ctx = makeCtx();
        handlePseudo(ctx, makeNode("EQU", ["FOO", "10"]));
        expect(ctx.symbols.get("FOO")).toBe(10);
    });

    test("redefinition throws error", () => {
        const ctx = makeCtx();
        handlePseudo(ctx, makeNode("EQU", ["FOO", "10"]));
        expect(() =>
            handlePseudo(ctx, makeNode("EQU", ["FOO", "20"]))
        ).toThrow(/redefined/);
    });

    // test("expression is evaluated", () => {
    //     const ctx = makeCtx();
    //     handlePseudo(ctx, makeNode("EQU", ["BAR", "1+2"]));
    //     expect(ctx.symbols.get("BAR")).toBe(3);
    // });

    test("case insensitive option treats foo=FOO", () => {
        const ctx = makeCtx();
        ctx.caseInsensitive = true;
        handlePseudo(ctx, makeNode("EQU", ["FOO", "5"]));
        expect(ctx.symbols.get("FOO")).toBe(5);
    });

    test("case sensitive mode treats foo != FOO", () => {
        const ctx = makeCtx();
        ctx.caseInsensitive = false;
        handlePseudo(ctx, makeNode("EQU", ["FOO", "5"]));
        handlePseudo(ctx, makeNode("EQU", ["foo", "6"]));
        expect(ctx.symbols.get("FOO")).toBe(5);
        expect(ctx.symbols.get("foo")).toBe(6);
    });

    test("symbol name truncated when exceeding SYMLEN", () => {
        const ctx = makeCtx();
        ctx.modeSymLen = 4;
        handlePseudo(ctx, makeNode("EQU", ["TOOLONG", "1"]));
        // シンボルは先頭4文字に切り捨て
        expect(ctx.symbols.get("TOOL")).toBe(1);
        // 警告が残っていることを確認
        expect(ctx.warnings?.[0]).toMatch(/truncated/i);
    });
});

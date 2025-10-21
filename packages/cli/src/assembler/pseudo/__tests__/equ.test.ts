import { AsmContext, createContext, SourcePos } from "../../context";
import { handlePseudo } from "../../pseudo";
import { NodePseudo } from "../../parser";

function makeCtx(): AsmContext {
    return createContext({ moduleName: "TEST" });
}

function makeNode(op: string, args: { key: string, value: string }[], pos: SourcePos = { line: 1, file: "test.asm" }): NodePseudo {
    return { kind: "pseudo", op, args, pos };
}

describe("pseudo - EQU", () => {
    test("basic EQU registers symbol", () => {
        const ctx = makeCtx();
        handlePseudo(ctx, makeNode("EQU", [{ key: "FOO", value: "10" }]));
        expect(ctx.symbols.get("FOO")?.value).toBe(10);
    });

    test("redefinition throws error", () => {
        const ctx = makeCtx();
        handlePseudo(ctx, makeNode("EQU", [{ key: "FOO", value: "10" }]));
        expect(() =>
            handlePseudo(ctx, makeNode("EQU", [{ key: "FOO", value: "20" }]))
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
        handlePseudo(ctx, makeNode("EQU", [{ key: "FOO", value: "5" }]));
        expect(ctx.symbols.get("FOO")?.value).toBe(5);
    });

    test("case sensitive mode treats foo != FOO", () => {
        const ctx = makeCtx();
        ctx.caseInsensitive = false;
        handlePseudo(ctx, makeNode("EQU", [{ key: "FOO", value: "5" }]));
        handlePseudo(ctx, makeNode("EQU", [{ key: "foo", value: "6" }]));
        expect(ctx.symbols.get("FOO")?.value).toBe(5);
        expect(ctx.symbols.get("foo")?.value).toBe(6);
    });

    test("symbol name truncated when exceeding SYMLEN", () => {
        const ctx = makeCtx();
        ctx.modeSymLen = 4;
        handlePseudo(ctx, makeNode("EQU", [{ key: "TOOLONG", value: "1" }]));
        // シンボルは先頭4文字に切り捨て
        expect(ctx.symbols.get("TOOL")?.value).toBe(1);
        // 警告が残っていることを確認
        expect(ctx.warnings[0].message).toMatch(/truncated/i);
    });
});

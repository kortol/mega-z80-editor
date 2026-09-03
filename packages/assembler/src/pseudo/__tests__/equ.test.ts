import { AsmContext, createContext, SourcePos } from "../../context";
import { handlePseudo } from "../../pseudo";
import { NodePseudo } from "../../node";

function makeCtx(): AsmContext {
    return createContext({ moduleName: "TEST", phase: "analyze", currentPos: { file: "test.asm", line: 1, phase: "analyze" } });
}

function makeNode(op: string, args: { key: string, value: string }[], pos: SourcePos = { line: 1, file: "test.asm", phase: "analyze" }): NodePseudo {
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
        ctx.options.caseSensitive = false;
        handlePseudo(ctx, makeNode("EQU", [{ key: "FOO", value: "5" }]));
        expect(ctx.symbols.get("FOO")?.value).toBe(5);
    });

    test("case sensitive mode treats foo != FOO", () => {
        const ctx = makeCtx();
        ctx.caseInsensitive = false;
        ctx.options.caseSensitive = true;
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

    test("EQU from label expression is treated as relocatable label", () => {
        const ctx = makeCtx();
        ctx.symbols.set("STAVAR", {
            value: 0x0200,
            sectionId: 1,
            type: "LABEL",
            pos: { line: 1, file: "test.asm", phase: "analyze" },
        });

        handlePseudo(ctx, makeNode("EQU", [{ key: "OC", value: "STAVAR+15*4" }]));

        expect(ctx.symbols.get("OC")?.value).toBe(0x023C);
        expect(ctx.symbols.get("OC")?.type).toBe("LABEL");
        expect(ctx.symbols.get("OC")?.sectionId).toBe(1);
    });

    test("EQU from current location ($) is treated as relocatable label", () => {
        const ctx = makeCtx();
        ctx.currentSection = 2;
        ctx.loc = 0x3456;

        handlePseudo(ctx, makeNode("EQU", [{ key: "HERE", value: "$" }]));

        expect(ctx.symbols.get("HERE")?.value).toBe(0x3456);
        expect(ctx.symbols.get("HERE")?.type).toBe("LABEL");
        expect(ctx.symbols.get("HERE")?.sectionId).toBe(2);
    });

    test("EQU is refreshed in emit phase with final location", () => {
        const ctx = makeCtx();
        ctx.currentSection = 0;
        ctx.loc = 0x0100;
        const node = makeNode("EQU", [{ key: "HERE", value: "$" }]);
        handlePseudo(ctx, node);

        ctx.phase = "emit";
        ctx.loc = 0x1234;
        handlePseudo(ctx, node);

        expect(ctx.symbols.get("HERE")?.value).toBe(0x1234);
        expect(ctx.symbols.get("HERE")?.type).toBe("LABEL");
    });

    test("difference of labels in same section stays CONST", () => {
        const ctx = makeCtx();
        ctx.symbols.set("A", {
            value: 0x1200,
            sectionId: 1,
            type: "LABEL",
            pos: { line: 1, file: "test.asm", phase: "analyze" },
        });
        ctx.symbols.set("B", {
            value: 0x1205,
            sectionId: 1,
            type: "LABEL",
            pos: { line: 1, file: "test.asm", phase: "analyze" },
        });

        handlePseudo(ctx, makeNode("EQU", [{ key: "LEN", value: "B-A" }]));

        expect(ctx.symbols.get("LEN")?.value).toBe(5);
        expect(ctx.symbols.get("LEN")?.type).toBe("CONST");
    });

    test(".SYMLEN without arg falls back to 32", () => {
        const ctx = makeCtx();
        ctx.modeSymLen = 6;
        handlePseudo(ctx, {
            kind: "pseudo",
            op: ".SYMLEN",
            args: [],
            pos: { line: 1, file: "test.asm", phase: "analyze" },
        });
        expect(ctx.modeSymLen).toBe(32);
    });
});

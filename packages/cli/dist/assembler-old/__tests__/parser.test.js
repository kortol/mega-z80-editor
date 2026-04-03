"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pegAdapter_1 = require("../../assembler/parser/pegAdapter");
const context_1 = require("../context");
function makeCtx() {
    return (0, context_1.createContext)({ moduleName: "TEST", currentPos: { line: 0, file: "test.asm", phase: "parse" }, options: { parser: "peg" } });
}
function parseLines(ctx, src) {
    return (0, pegAdapter_1.parsePeg)(ctx, src);
}
describe("parser", () => {
    // 1. 命令のみ
    test("LD A,1", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "LD A,1");
        expect(nodes).toMatchObject([
            { kind: "instr", op: "LD", args: ["A", "1"], pos: { line: 0, file: "test.asm" } }
        ]);
    });
    // 2. コメント削除済み（空行確認）
    test("comment line is ignored", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "LD A,1\n; comment\nLD B,2");
        expect(nodes).toMatchObject([
            { kind: "instr", op: "LD", args: ["A", "1"], pos: { line: 0, file: "test.asm" } },
            { kind: "instr", op: "LD", args: ["B", "2"], pos: { line: 2, file: "test.asm" } }
        ]);
    });
    // 3. ラベルのみ
    test("label only", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "START:");
        expect(nodes).toMatchObject([
            { kind: "label", name: "START", pos: { line: 0, file: "test.asm" } }
        ]);
    });
    // 4. ラベル＋命令
    test("label and instruction", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "START: LD A,1");
        expect(nodes).toMatchObject([
            { kind: "label", name: "START", pos: { line: 0, file: "test.asm" } },
            { kind: "instr", op: "LD", args: ["A", "1"], pos: { line: 0, file: "test.asm" } }
        ]);
    });
    // 5. 疑似命令 ORG
    test("ORG pseudo", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "ORG 100H");
        expect(nodes).toMatchObject([
            { kind: "pseudo", op: "ORG", args: [{ value: "100H" }], pos: { line: 0, file: "test.asm" } }
        ]);
    });
    // 6. 疑似命令 EQU
    test("EQU pseudo", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "FOO EQU 10");
        // P1簡易仕様: "EQU" を疑似命令として扱い、args に残りを入れる
        expect(nodes).toMatchObject([
            { kind: "pseudo", op: "EQU", args: [{ key: "FOO", value: "10" }], pos: { line: 0, file: "test.asm" } }
        ]);
    });
    test("EQU with expression", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "BAR EQU 0x100+10");
        expect(nodes).toMatchObject([
            { kind: "pseudo", op: "EQU", args: [{ key: "BAR", value: "0x100+10" }], pos: { line: 0, file: "test.asm" } }
        ]);
    });
    // 7. 疑似命令 DB, DW
    test("DB and DW pseudo", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "DB 1,2,3\nDW 100H");
        expect(nodes).toMatchObject([
            { kind: "pseudo", op: "DB", args: [{ value: "1" }, { value: "2" }, { value: "3" }], pos: { line: 0, file: "test.asm" } },
            { kind: "pseudo", op: "DW", args: [{ value: "100H" }], pos: { line: 1, file: "test.asm" } }
        ]);
    });
    // 8. 複数行
    test("multi-line instructions", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "LD A,1\nCALL START");
        expect(nodes).toMatchObject([
            { kind: "instr", op: "LD", args: ["A", "1"], pos: { line: 0, file: "test.asm" } },
            { kind: "instr", op: "CALL", args: ["START"], pos: { line: 1, file: "test.asm" } }
        ]);
    });
    // エラー系 9. 未知命令
    test("unknown instruction", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "FOOBAR 123");
        expect(nodes).toMatchObject([
            {
                kind: "macroInvoke",
                name: "FOOBAR",
                args: ["123"],
                pos: {
                    file: "test.asm",
                    line: 0,
                }
            }
        ]);
    });
    // エラー系 10. 行頭が数値
    test("line starts with number", () => {
        const ctx = makeCtx();
        expect(() => {
            const c = parseLines(ctx, "123 LD A,1");
            console.log(c);
            return c;
        }).toThrow(/Syntax error/);
    });
    // エラー系 11. コロンだけ
    test("colon only", () => {
        const ctx = makeCtx();
        expect(() => parseLines(ctx, ":")).toThrow(/Syntax error/);
    });
    test("label + EQU is invalid", () => {
        const ctx = makeCtx();
        expect(() => parseLines(ctx, "FOO: EQU 10")).toThrow(/EQU cannot be used/);
    });
    test("parse INCLUDE directive", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, 'INCLUDE "src/assembler/__tests__/mac.inc"');
        console.log(nodes);
        expect(nodes).toMatchObject([
            {
                kind: "pseudo",
                op: "INCLUDE",
                args: [{ value: "src/assembler/__tests__/mac.inc" }],
                pos: {
                    file: "test.asm",
                },
            }
        ]);
    });
    test("context basic", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, 'INCLUDE "src/assembler/__tests__/mac.inc"\nLD A,0');
        expect(nodes[0]).toMatchObject({
            kind: "pseudo",
            op: "INCLUDE",
            args: [{ value: "src/assembler/__tests__/mac.inc" }],
            pos: {
                file: "test.asm",
            }
        });
        expect(nodes[1]).toMatchObject({
            kind: "instr",
            op: "LD",
            args: ["A", "0"],
            pos: {
                file: "test.asm",
            }
        });
    });
});

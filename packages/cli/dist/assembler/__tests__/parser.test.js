"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pegAdapter_1 = require("../../assembler/parser/pegAdapter");
const context_1 = require("../context");
function makeCtx() {
    return (0, context_1.createContext)({ moduleName: "TEST", currentPos: { line: 0, file: "test.asm", phase: "parse" }, options: {} });
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
            { kind: "empty", pos: { line: 1, file: "test.asm" } },
            { kind: "instr", op: "LD", args: ["B", "2"], pos: { line: 2, file: "test.asm" } }
        ]);
    });
    test("empty line becomes empty node", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "LD A,1\n\nLD B,2");
        expect(nodes).toMatchObject([
            { kind: "instr", op: "LD", args: ["A", "1"], pos: { line: 0, file: "test.asm" } },
            { kind: "empty", pos: { line: 1, file: "test.asm" } },
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
    test("OUT (n),r is parsed (compatibility-first)", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "OUT (1234H),B");
        expect(nodes).toMatchObject([
            { kind: "instr", op: "OUT", args: ["(1234H)", "B"], pos: { line: 0, file: "test.asm" } }
        ]);
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
    test("extended ISA mnemonics are parsed", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "MULUB A,B\nJAF label\nLDUP HL,(1234H)\nMLT BC\nIN0 A,(0)\nTSTIO 0");
        expect(nodes).toMatchObject([
            { kind: "instr", op: "MULUB", args: ["A", "B"], pos: { line: 0, file: "test.asm" } },
            { kind: "instr", op: "JAF", args: ["label"], pos: { line: 1, file: "test.asm" } },
            { kind: "instr", op: "LDUP", args: ["HL", "(1234H)"], pos: { line: 2, file: "test.asm" } },
            { kind: "instr", op: "MLT", args: ["BC"], pos: { line: 3, file: "test.asm" } },
            { kind: "instr", op: "IN0", args: ["A", "(0)"], pos: { line: 4, file: "test.asm" } },
            { kind: "instr", op: "TSTIO", args: ["0"], pos: { line: 5, file: "test.asm" } },
        ]);
    });
    test("P2-M: parse DEFL/DEFM/DC and aliases", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, 'FOO DEFL 1\nDEFM "AB",1\nDC "HI"\nEXT BAR\nEXTERNAL BAZ');
        expect(nodes).toMatchObject([
            { kind: "pseudo", op: "SET", args: [{ key: "FOO", value: "1" }] },
            { kind: "pseudo", op: "DB", args: [{ value: '"AB"' }, { value: "1" }] },
            { kind: "pseudo", op: "DC", args: [{ value: '"HI"' }] },
            { kind: "pseudo", op: "EXT", args: [{ value: "BAR" }] },
            { kind: "pseudo", op: "EXTERNAL", args: [{ value: "BAZ" }] },
        ]);
    });
    test("P2-M: parse condition/list/segment directives", () => {
        const ctx = makeCtx();
        const nodes = parseLines(ctx, "IFDEF FOO\nIFNDEF BAR\nIFB <>\nIFNB <X>\nIFDIF <A>,<B>\nCSEG\nDSEG\nASEG\nCOMMON\nLIST OFF\nPAGE 60\nTITLE TEST\nGLOBAL START\nLOCAL TMP\nEXITM");
        expect(nodes).toMatchObject([
            { kind: "pseudo", op: "IFDEF", args: [{ value: "FOO" }] },
            { kind: "pseudo", op: "IFNDEF", args: [{ value: "BAR" }] },
            { kind: "pseudo", op: "IFB", args: [{ value: "<>" }] },
            { kind: "pseudo", op: "IFNB", args: [{ value: "<X>" }] },
            { kind: "pseudo", op: "IFDIF", args: [{ value: "<A>" }, { value: "<B>" }] },
            { kind: "pseudo", op: "CSEG", args: [] },
            { kind: "pseudo", op: "DSEG", args: [] },
            { kind: "pseudo", op: "ASEG", args: [] },
            { kind: "pseudo", op: "COMMON", args: [] },
            { kind: "pseudo", op: "LIST", args: [{ value: "OFF" }] },
            { kind: "pseudo", op: "PAGE", args: [{ value: "60" }] },
            { kind: "pseudo", op: "TITLE", args: [{ value: "TEST" }] },
            { kind: "pseudo", op: "GLOBAL", args: [{ value: "START" }] },
            { kind: "pseudo", op: "LOCAL", args: [{ value: "TMP" }] },
            { kind: "pseudo", op: "EXITM", args: [] },
        ]);
    });
});

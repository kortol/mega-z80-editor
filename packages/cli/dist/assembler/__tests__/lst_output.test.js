"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../../logger");
const mz80_as_1 = require("../../cli/mz80-as");
describe("P2-D-EX-02: INCLUDE trace in listing", () => {
    const tmpDir = path.resolve(__dirname, "__tmp_include_trace__");
    const fileA = path.join(tmpDir, "main.asm");
    const fileB = path.join(tmpDir, "sub1.inc");
    const fileC = path.join(tmpDir, "sub2.inc");
    const outRel = path.join(tmpDir, "main.rel");
    const outLst = outRel.replace(/\.rel$/, ".lst");
    beforeAll(() => {
        fs.mkdirSync(tmpDir, { recursive: true });
        // --- サブファイル構造を用意 ---
        fs.writeFileSync(fileC, "LD A,3\n", "utf8");
        fs.writeFileSync(fileB, `INCLUDE "${tmpDir}/sub2.inc"\nLD A,2\n`, "utf8");
        fs.writeFileSync(fileA, `INCLUDE "${tmpDir}/sub1.inc"\nLD A,1\n`, "utf8");
    });
    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    test("generate LST with include trace", () => {
        const logger = (0, logger_1.createLogger)("verbose");
        const ctx = (0, mz80_as_1.assemble)(logger, fileA, outRel, { verbose: false, relVersion: 2 });
        expect(fs.existsSync(outLst)).toBe(true);
        const lst = fs.readFileSync(outLst, "utf8").trimEnd();
        console.log(lst);
        // --- Golden出力（期待値） ---
        const expected = [
            "; --- SECTION: .text ---",
            ";#include \"main.asm\"",
            ";#include \"sub1.inc\" (from main.asm line 1)",
            ";#include \"sub2.inc\" (from sub1.inc line 1)",
            "0000  3E 03           LD A,3",
            ";#endinclude (sub2.inc)",
            "0002  3E 02           LD A,2",
            ";#endinclude (sub1.inc)",
            "0004  3E 01           LD A,1",
            ";#endinclude (main.asm)"
        ].join("\n");
        // Golden差分テスト
        expect(normalize(lst)).toBe(normalize(expected));
    });
});
describe("P2-D-EX-06: LST v2 non-data formatting", () => {
    const tmpDir = path.resolve(__dirname, "__tmp_lst_v2__");
    const fileA = path.join(tmpDir, "main.asm");
    const outRel = path.join(tmpDir, "main.rel");
    const outLst = outRel.replace(/\.rel$/, ".lst");
    beforeAll(() => {
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(fileA, [
            "DB 0",
            "ALIGN 4",
            "DS 8",
            "LD A,1",
            "END",
        ].join("\n"), "utf8");
    });
    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    test("LST shows ALIGN and DS with chunked bytes", () => {
        const logger = (0, logger_1.createLogger)("quiet");
        (0, mz80_as_1.assemble)(logger, fileA, outRel, { verbose: false, relVersion: 2 });
        const lst = fs.readFileSync(outLst, "utf8");
        expect(lst).toContain("; --- SECTION: .text ---");
        expect(lst).toContain("ALIGN 4");
        expect(lst).toContain("DS 8");
        // DS 8 should emit 2 lines (8 bytes -> 2 chunks)
        expect(lst).toMatch(/\n0004\s+00 00 00 00\s+DS 8/);
        expect(lst).toMatch(/\n\s{4}00 00 00 00/);
    });
});
describe("P2-D-07: .sym includes def file", () => {
    const tmpDir = path.resolve(__dirname, "__tmp_sym__");
    const fileA = path.join(tmpDir, "main.asm");
    const outRel = path.join(tmpDir, "main.rel");
    const outSym = outRel.replace(/\.rel$/, ".sym");
    beforeAll(() => {
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(fileA, [
            "FOO EQU 10",
            "LABEL: NOP",
            "EXTERN EXT1",
            "END",
        ].join("\n"), "utf8");
    });
    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    test("sym lines include basename", () => {
        const logger = (0, logger_1.createLogger)("quiet");
        (0, mz80_as_1.assemble)(logger, fileA, outRel, { verbose: false, relVersion: 2 });
        const sym = fs.readFileSync(outSym, "utf8");
        expect(sym).toMatch(/FOO\s+000AH\s+LABEL\s+main\.asm/i);
        expect(sym).toMatch(/LABEL\s+[0-9A-F]{4}H\s+LABEL\s+main\.asm/i);
        expect(sym).toMatch(/EXT1\s+----H\s+EXTERN\s+-/i);
    });
});
// 正規化: 改行・空白を一定化
function normalize(str) {
    return str.replace(/\r\n/g, "\n").trim();
}

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
            ";#include <main.asm>",
            ";#include <sub1.inc>",
            ";#include <sub2.inc>",
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
// 正規化: 改行・空白を一定化
function normalize(str) {
    return str.replace(/\r\n/g, "\n").trim();
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const context_1 = require("../../context");
const errors_1 = require("../../errors");
const pegAdapter_1 = require("../../../assembler/parser/pegAdapter");
const analyze_1 = require("../../analyze");
const mz80_as_1 = require("../../../cli/mz80-as");
const logger_1 = require("../../../logger");
describe("P2-D-EX-01: INCLUDE loop detection", () => {
    const tmpDir = path_1.default.resolve(__dirname, "__tmp_include_loop__");
    const fileA = path_1.default.join(tmpDir, "a.asm");
    const fileB = path_1.default.join(tmpDir, "b.inc");
    beforeAll(() => {
        fs_1.default.mkdirSync(tmpDir, { recursive: true });
        fs_1.default.writeFileSync(fileA, 'INCLUDE "b.inc"\nLD A,1\n');
        fs_1.default.writeFileSync(fileB, 'INCLUDE "a.asm"\nLD A,2\n');
    });
    afterAll(() => {
        fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
    });
    test("detect circular INCLUDE (A→B→A)", () => {
        const ctx = (0, context_1.createContext)();
        ctx.currentPos.file = fileA;
        const src = fs_1.default.readFileSync(fileA, "utf8");
        ctx.nodes = (0, pegAdapter_1.parsePeg)(ctx, src);
        let thrown;
        try {
            (0, analyze_1.runAnalyze)(ctx);
        }
        catch (err) {
            thrown = err;
        }
        expect(thrown).toEqual(expect.objectContaining({
            code: errors_1.AssemblerErrorCode.IncludeLoop,
        }));
        expect(ctx.includeStack.length).toBe(0); // stack 復帰確認
    });
    test("restore section after INCLUDE", () => {
        const tmpDir2 = path_1.default.resolve(__dirname, "__tmp_include_section__");
        const mainFile = path_1.default.join(tmpDir2, "main.asm");
        const subFile = path_1.default.join(tmpDir2, "sub.inc");
        const outRel = path_1.default.join(tmpDir2, "main.rel");
        fs_1.default.mkdirSync(tmpDir2, { recursive: true });
        fs_1.default.writeFileSync(subFile, "SECTION DATA\nDB 2\n", "utf8");
        fs_1.default.writeFileSync(mainFile, `SECTION TEXT\nINCLUDE "${subFile}"\nDB 1\n`, "utf8");
        const logger = (0, logger_1.createLogger)("quiet");
        const ctx = (0, mz80_as_1.assemble)(logger, mainFile, outRel, { relVersion: 2 });
        const textId = Array.from(ctx.sections.values()).find(s => s.name === ".text")?.id;
        const dataId = Array.from(ctx.sections.values()).find(s => s.name === ".data")?.id;
        const first = ctx.texts[0];
        const last = ctx.texts[ctx.texts.length - 1];
        expect(first.sectionId).toBe(dataId);
        expect(last.sectionId).toBe(textId);
        fs_1.default.rmSync(tmpDir2, { recursive: true, force: true });
    });
    test("duplicate INCLUDE is skipped with warning", () => {
        const tmpDir3 = path_1.default.resolve(__dirname, "__tmp_include_dup__");
        const mainFile = path_1.default.join(tmpDir3, "main.asm");
        const subFile = path_1.default.join(tmpDir3, "sub.inc");
        const outRel = path_1.default.join(tmpDir3, "main.rel");
        fs_1.default.mkdirSync(tmpDir3, { recursive: true });
        fs_1.default.writeFileSync(subFile, "DB 9\n", "utf8");
        fs_1.default.writeFileSync(mainFile, `INCLUDE "${subFile}"\nINCLUDE "${subFile}"\nDB 1\n`, "utf8");
        const logger = (0, logger_1.createLogger)("quiet");
        const ctx = (0, mz80_as_1.assemble)(logger, mainFile, outRel, { relVersion: 2 });
        expect(ctx.warnings.some(w => w.code === errors_1.AssemblerErrorCode.IncludeDuplicate)).toBe(true);
        expect(ctx.includeStack.length).toBe(0);
        fs_1.default.rmSync(tmpDir3, { recursive: true, force: true });
    });
});

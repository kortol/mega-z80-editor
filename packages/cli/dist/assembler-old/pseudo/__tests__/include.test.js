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
        ctx.options.parser = "peg";
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
});

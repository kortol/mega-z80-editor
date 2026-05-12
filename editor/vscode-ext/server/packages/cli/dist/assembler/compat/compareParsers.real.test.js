"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const compareParsers_1 = require("./compareParsers");
const examplesRepo_1 = require("../../examplesRepo");
const repoRoot = path_1.default.resolve(__dirname, "../../../../..");
const examplesRoot = (0, examplesRepo_1.resolveExamplesRepoDir)(repoRoot);
const packageLocalFiles = [
    "packages/cli/examples/include-smoke/sub2.inc",
    "packages/cli/examples/include-smoke/sub1.inc",
    "packages/cli/examples/include-smoke/main.asm",
    "packages/cli/examples/linktest/test_sections.asm",
    "packages/cli/examples/linktest/test.asm",
    "packages/cli/src/assembler/__tests__/mac.inc",
    "packages/cli/src/assembler/examples/sample.asm",
];
const externalFiles = [
    "p1-c/p1c_fixture.asm",
    "z80test/src/z80memptr.asm",
    "z80test/src/z80full.asm",
    "z80test/src/z80flags.asm",
    "z80test/src/z80docflags.asm",
    "z80test/src/z80doc.asm",
    "z80test/src/z80ccfscr.asm",
    "z80test/src/z80ccf.asm",
    "z80test/src/tests.asm",
    "z80test/src/testmacros.asm",
    "z80test/src/print.asm",
    "z80test/src/main.asm",
    "z80test/src/idea.asm",
    "z80test/src/crctab.asm",
    "p1-d/fixture-p1d.asm",
    "hello-msx/src/main.asm",
    "hello/src/hello.asm",
    "hello/src/bdos.asm",
];
const files = [
    ...packageLocalFiles.map((rel) => ({
        label: rel,
        full: path_1.default.join(repoRoot, rel),
        shouldSkip: false,
    })),
    ...externalFiles
        .map((rel) => ({
        label: `${examplesRepo_1.EXAMPLES_REPO_NAME}/${rel}`,
        full: (0, examplesRepo_1.resolveExamplesPath)(repoRoot, rel),
        shouldSkip: rel.includes("z80test"),
    }))
        .filter((entry) => !!entry.full),
];
describe("PEG parser (real files)", () => {
    test("debug p1c peg", () => {
        const input = (0, examplesRepo_1.resolveExamplesPath)(repoRoot, "p1-c", "p1c_fixture.asm");
        if (!input) {
            if (!examplesRoot) {
                console.warn(`Skipping p1-c debug fixture because ${examplesRepo_1.EXAMPLES_REPO_NAME} is not available.`);
            }
            return;
        }
        const res = (0, compareParsers_1.runPegFile)("p1c", input, { relVersion: 2 });
        console.log("debug p1c peg errors", res.errors);
        console.log("debug p1c peg warnings", res.warnings);
        expect(res.errors).toEqual([]);
    });
    for (const entry of files) {
        const name = entry.label.replace(/[\\/]/g, "_");
        const full = entry.full;
        const shouldSkip = entry.shouldSkip;
        const runner = shouldSkip ? test.skip : test;
        runner(entry.label, () => {
            const result = (0, compareParsers_1.runPegFile)(name, full, { keepTemp: false, relVersion: 2 });
            expect(result.exception).toBeUndefined();
            expect(result.errors).toEqual([]);
        });
    }
});

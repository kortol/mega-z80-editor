"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const testUtils_1 = require("../../../assembler/testUtils");
const FIXTURE_DIR = path_1.default.resolve(__dirname, "../../../../tests/z80test");
function listAsmFixtures(dir) {
    if (!fs_1.default.existsSync(dir))
        return [];
    return fs_1.default
        .readdirSync(dir)
        .filter(name => name.toLowerCase().endsWith(".asm"))
        .map(name => path_1.default.join(dir, name));
}
function loadBinBytes(binPath) {
    const buf = fs_1.default.readFileSync(binPath);
    return Array.from(buf.values());
}
const asmFiles = listAsmFixtures(FIXTURE_DIR);
if (asmFiles.length === 0) {
    test.skip("z80test golden fixtures (no fixtures found)", () => { });
}
else {
    describe("z80test golden fixtures", () => {
        for (const asmPath of asmFiles) {
            const base = path_1.default.basename(asmPath, ".asm");
            const binPath = path_1.default.join(FIXTURE_DIR, `${base}.bin`);
            test(base, () => {
                if (!fs_1.default.existsSync(binPath)) {
                    throw new Error(`Missing .bin for fixture: ${base}`);
                }
                const ctx = (0, testUtils_1.phaseEmit)(asmPath, "TEST", {});
                const actual = (0, testUtils_1.getBytes)(ctx);
                const expected = loadBinBytes(binPath);
                expect(actual).toEqual(expected);
            });
        }
    });
}

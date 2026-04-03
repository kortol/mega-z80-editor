"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const outputUtils_1 = require("../outputUtils");
describe("outputUtils", () => {
    const tmpDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), "oututil-"));
    const textPath = path_1.default.join(tmpDir, "test.txt");
    const binPath = path_1.default.join(tmpDir, "test.bin");
    afterAll(() => {
        fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
    });
    it("replaceExt replaces extension correctly", () => {
        expect((0, outputUtils_1.replaceExt)("foo.abs", ".map")).toBe("foo.map");
        expect((0, outputUtils_1.replaceExt)("dir/x.rel", ".log")).toBe(path_1.default.join("dir", "x.log"));
    });
    it("writeOutputFile writes expected content", () => {
        (0, outputUtils_1.writeOutputFile)(textPath, "HELLO");
        const data = fs_1.default.readFileSync(textPath, "utf-8");
        expect(data).toBe("HELLO");
    });
    it("writeOutputFile writes expected bytes", () => {
        const bytes = new Uint8Array([1, 2, 3]);
        (0, outputUtils_1.writeOutputFile)(binPath, bytes, true, "[BIN]");
        const out = fs_1.default.readFileSync(binPath);
        expect(out.equals(Buffer.from(bytes))).toBe(true);
    });
    it("verbose mode prints logs", () => {
        const spy = jest.spyOn(console, "log").mockImplementation(() => { });
        (0, outputUtils_1.writeOutputFile)(textPath, "X", true);
        (0, outputUtils_1.writeOutputFile)(binPath, new Uint8Array([0xAA]), true);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
    it("verbose mode shows both bytes and human-readable size", () => {
        const spy = jest.spyOn(console, "log").mockImplementation(() => { });
        const data = new Uint8Array(512);
        (0, outputUtils_1.writeOutputFile)("test.bin", data, true);
        const output = spy.mock.calls.map(c => c[0]).join("\n");
        expect(output).toMatch(/512 bytes \/ 0\.50 KB/);
        spy.mockRestore();
    });
});

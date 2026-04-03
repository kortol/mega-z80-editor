"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const baseTextAdapter_1 = require("../baseTextAdapter");
const crypto_1 = require("crypto");
class MockAdapter extends baseTextAdapter_1.BaseTextAdapter {
    ext = ".map";
    tag = "[MAP]";
    generateText() {
        return "Hello Map";
    }
}
describe("BaseTextAdapter", () => {
    const tmpDir = path_1.default.join(os_1.default.tmpdir(), "mz80-tests-" + (0, crypto_1.randomUUID)());
    const mapPath = path_1.default.join(tmpDir, "test.map");
    function safeUnlink(p) {
        try {
            fs_1.default.unlinkSync(p);
        }
        catch { /* ignore */ }
    }
    function safeRmdir(p) {
        try {
            fs_1.default.rmdirSync(p);
        }
        catch { /* ignore */ }
    }
    beforeAll(() => fs_1.default.mkdirSync(tmpDir, { recursive: true }));
    afterEach(() => fs_1.default.existsSync(mapPath) && safeUnlink(mapPath));
    afterAll(() => {
        if (fs_1.default.existsSync(mapPath)) {
            safeUnlink(mapPath);
        }
        // 一時ディレクトリも削除
        safeRmdir(tmpDir);
    });
    it("writes text file", () => {
        new MockAdapter().write(mapPath, false);
        const content = fs_1.default.readFileSync(mapPath, "utf-8");
        expect(content).toBe("Hello Map");
    });
    it("verbose mode prints tag and size", () => {
        const spy = jest.spyOn(console, "log").mockImplementation(() => { });
        new MockAdapter().write(mapPath, true);
        const output = spy.mock.calls.map(c => c[0]).join("\n");
        expect(output).toMatch(/\[MAP\]/);
        expect(output).toMatch(/bytes/);
        spy.mockRestore();
    });
    it("formatSize computes UTF-8 bytes correctly", () => {
        const adapter = new MockAdapter();
        expect(adapter["formatSize"]("あ")).toBe("3 bytes");
    });
    it("calls generateText()", () => {
        const spy = jest.spyOn(MockAdapter.prototype, "generateText");
        new MockAdapter().write(mapPath);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});

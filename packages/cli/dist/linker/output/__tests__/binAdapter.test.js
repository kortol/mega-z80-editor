"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/linker/output/__tests__/binAdapter.test.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const binAdapter_1 = require("../binAdapter");
const crypto_1 = require("crypto");
describe("P1-F: BinOutputAdapter", () => {
    const tmpDir = path_1.default.join(os_1.default.tmpdir(), "mz80-tests-" + (0, crypto_1.randomUUID)());
    const absPath = path_1.default.join(tmpDir, "TEST.ABS");
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
    beforeAll(() => {
        fs_1.default.mkdirSync(tmpDir, { recursive: true });
    });
    afterAll(() => {
        if (fs_1.default.existsSync(absPath)) {
            safeUnlink(absPath);
        }
        // 一時ディレクトリも削除
        safeRmdir(tmpDir);
    });
    it("writes segment data correctly", () => {
        const result = {
            symbols: new Map(),
            entry: 0x100,
            segments: [
                {
                    bank: 0,
                    kind: "text",
                    range: { min: 0x100, max: 0x102 },
                    data: new Uint8Array([0x3E, 0x00, 0xC9]),
                },
            ],
        };
        const adapter = new binAdapter_1.BinOutputAdapter(result);
        adapter.write(absPath); // ✅ 出力ファイル指定
        const bin = fs_1.default.readFileSync(absPath);
        expect(bin).toBeInstanceOf(Uint8Array);
        expect(bin.length).toBe(14);
        // ファイルの内容は”0100 3E 00 C9”という文字列なのでそれを直接チェック
        expect(bin.toString()).toBe("0100: 3E 00 C9");
    });
    it("throws if segment is missing", () => {
        const result = { symbols: new Map(), segments: [], entry: 0x0 };
        const adapter = new binAdapter_1.BinOutputAdapter(result);
        expect(() => adapter.write(absPath)).toThrow(/No segments/);
    });
});

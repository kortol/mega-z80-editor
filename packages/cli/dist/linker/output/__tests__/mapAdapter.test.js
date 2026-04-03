"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const mapAdapter_1 = require("../mapAdapter");
const crypto_1 = require("crypto");
describe("P1-F: MapAdapter (BaseTextAdapter継承)", () => {
    const tmpDir = path_1.default.join(os_1.default.tmpdir(), "mz80-tests-" + (0, crypto_1.randomUUID)());
    const mapPath = path_1.default.join(tmpDir, "test.map");
    const sample = {
        segments: [
            { bank: 0, kind: "text", range: { min: 0x0100, max: 0x0105 }, data: new Uint8Array(6) },
        ],
        entry: 0x0100,
        symbols: new Map([
            ["START", { bank: 0, addr: 0x0100 }],
            ["ZERO", { bank: 0, addr: 0x0000 }],
            ["UNRES", { bank: 0, addr: 0x0000 }], // 未解決扱い
        ]),
    };
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
    it("generates valid MAP output", () => {
        const adapter = new mapAdapter_1.MapAdapter(sample);
        adapter.write(mapPath, false);
        const text = fs_1.default.readFileSync(mapPath, "utf-8");
        expect(text).toMatch(/LINK MAP OF OUTPUT/);
        expect(text).toMatch(/@START/);
        expect(text).toMatch(/SEGMENTS:/);
        expect(text).toMatch(/ENTRY:/);
    });
    it("marks unresolved symbols with '?'", () => {
        const adapter = new mapAdapter_1.MapAdapter(sample);
        const text = adapter.generateText();
        expect(text).toMatch(/\?UNRES/);
    });
    it("shows human-readable size in segments", () => {
        const text = new mapAdapter_1.MapAdapter(sample).generateText();
        expect(text).toMatch(/size=0006H/);
        expect(text).toMatch(/\(6 bytes\)/);
    });
    it("prints verbose log with size", () => {
        const spy = jest.spyOn(console, "log").mockImplementation(() => { });
        new mapAdapter_1.MapAdapter(sample).write(mapPath, true);
        const out = spy.mock.calls.map(c => c[0]).join("\n");
        expect(out).toMatch(/\[MAP\]/);
        expect(out).toMatch(/bytes/);
        spy.mockRestore();
    });
});

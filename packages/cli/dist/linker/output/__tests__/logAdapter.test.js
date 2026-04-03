"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logAdapter_1 = require("../logAdapter");
describe("P1-F: LogAdapter", () => {
    it("outputs basic report with no warnings", () => {
        const result = {
            symbols: new Map([
                ["START", { bank: 0, addr: 0x100 }],
                ["ZERO", { bank: 0, addr: 0x0 }],
            ]),
            segments: [{ bank: 0, kind: "text", range: { min: 0x100, max: 0x120 }, data: new Uint8Array(32) }],
            entry: 0x100,
        };
        const adapter = new logAdapter_1.LogAdapter(result, []);
        const text = adapter.generateText();
        expect(text).toMatch(/LINK REPORT/);
        expect(text).toMatch(/Segments: 1/);
        expect(text).toMatch(/Symbols: 2/);
        expect(text).toMatch(/Entry: 0100H/);
        expect(text).toMatch(/No warnings/);
    });
    it("outputs warnings when present", () => {
        const result = { symbols: new Map(), segments: [], entry: 0x200 };
        const adapter = new logAdapter_1.LogAdapter(result, [
            "Unresolved symbol: ZERO",
            "Duplicate definition ignored: CONST",
        ]);
        const text = adapter.generateText();
        expect(text).toMatch(/WARNINGS:/);
        expect(text).toMatch(/W001/);
        expect(text).toMatch(/W002/);
    });
    it("shows (none) when no entry point", () => {
        const result = { symbols: new Map(), segments: [], entry: undefined };
        const adapter = new logAdapter_1.LogAdapter(result, []);
        const text = adapter.generateText();
        expect(text).toMatch(/Entry: \(none\)/);
    });
});

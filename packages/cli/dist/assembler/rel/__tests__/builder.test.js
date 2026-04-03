"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/assembler/rel/__tests__/builder.test.ts
const builder_1 = require("../builder");
const adapter_1 = require("../adapter");
const context_1 = require("../../context");
const pos = { file: "", line: 0, phase: "emit" };
function makeCtx() {
    const ctx = (0, context_1.createContext)({
        moduleName: "TESTMOD",
        texts: [
            { addr: 0x1000, data: [0x3E, 0x01], pos }, // LD A,1
            { addr: 0x1002, data: [0xC3, 0x00, 0x10], pos } // JP 1000H
        ],
        unresolved: [{
                addr: 0x1002, symbol: "START", size: 2, requester: {
                    op: "JP", // or "DATA" depending on pseudo
                    phase: "assemble",
                    pos,
                }
            }],
        entry: 0x1000
    });
    (0, context_1.defineSymbol)(ctx, "START", 0x1000, "LABEL");
    return ctx;
}
describe("rel builder", () => {
    test("buildRelFile + TextRelAdapter output", () => {
        const ctx = makeCtx();
        const file = (0, builder_1.buildRelFile)(ctx);
        const adapter = new adapter_1.TextRelAdapter();
        const output = adapter.write(file);
        expect(output).toContain("H TESTMOD");
        expect(output).toContain("T 1000 3E 01");
        expect(output).toContain("S START 1000");
        expect(output).toContain("R 1002 START");
        expect(output).toContain("E 1000");
    });
    test("multiple T records", () => {
        const b = new builder_1.RelBuilder("MULTI");
        b.addText(0x0000, [0x00]);
        b.addText(0x0010, [0xC3, 0x00, 0x10]); // JP 1000H
        const adapter = new adapter_1.TextRelAdapter();
        const out = adapter.write(b.build());
        expect(out).toContain("T 0000 00");
        expect(out).toContain("T 0010 C3 00 10");
    });
    test("unresolved symbol -> R record", () => {
        const b = new builder_1.RelBuilder("UNRES");
        b.addUnresolved(0x1234, "FOO");
        const adapter = new adapter_1.TextRelAdapter();
        const out = adapter.write(b.build());
        expect(out).toContain("R 1234 FOO");
    });
    test("empty module only H/E", () => {
        const b = new builder_1.RelBuilder("EMPTY");
        b.setEntry(0);
        const adapter = new adapter_1.TextRelAdapter();
        const out = adapter.write(b.build());
        expect(out.split("\n")).toEqual([
            "H EMPTY",
            "E 0000",
        ]);
    });
    test("R record with addend", () => {
        const b = new builder_1.RelBuilder("MOD1");
        b.addText(0x1000, [0x3E, 0x00]); // LD A,nn
        b.addReloc(0x1001, "FOO", 5); // A=addr of FOO+5
        b.setEntry(0x1000); // END 1000H
        const adapter = new adapter_1.TextRelAdapter();
        const out = adapter.write(b.build());
        // H + T + R + E の最低限が出ているか
        expect(out).toContain("H MOD1");
        expect(out).toContain("T 1000 3E 00");
        expect(out).toContain("R 1001 FOO+5");
        expect(out).toContain("E 1000");
    });
    test("R record without addend", () => {
        const b = new builder_1.RelBuilder("MOD2");
        b.addText(0x2000, [0x21, 0x00, 0x00]); // LD HL,nn
        b.addReloc(0x2001, "BAR"); // HL = BAR
        const adapter = new adapter_1.TextRelAdapter();
        const out = adapter.write(b.build());
        expect(out).toContain("R 2001 BAR");
        // addendなしなので末尾に数値は付かない
        expect(out).not.toMatch(/BAR \d+/);
    });
});

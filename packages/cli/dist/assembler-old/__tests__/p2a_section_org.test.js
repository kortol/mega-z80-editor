"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const emit_1 = require("../codegen/emit");
const context_1 = require("../context");
const align_1 = require("../pseudo/align");
const section_1 = require("../pseudo/section");
test("SECTION/ALIGN maintain independent LC", () => {
    const ctx = (0, context_1.createContext)();
    (0, section_1.handleSECTION)(ctx, "TEXT");
    (0, emit_1.setLC)(ctx, 0x100);
    (0, section_1.handleSECTION)(ctx, "DATA");
    (0, emit_1.setLC)(ctx, 0x200);
    (0, section_1.handleSECTION)(ctx, "TEXT");
    expect((0, emit_1.getLC)(ctx)).toBe(0x100);
    (0, section_1.handleSECTION)(ctx, "DATA");
    expect((0, emit_1.getLC)(ctx)).toBe(0x200);
    (0, align_1.handleALIGN)(ctx, 0x10);
    expect((0, emit_1.getLC)(ctx) % 0x10).toBe(0);
});

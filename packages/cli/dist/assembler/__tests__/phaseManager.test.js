"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const phaseManager_1 = require("../phaseManager");
const context_1 = require("../context");
test("valid phase transition", () => {
    const ctx = (0, context_1.createContext)({});
    ctx.phase = "tokenize";
    (0, phaseManager_1.setPhase)(ctx, "parse");
    expect(ctx.phase).toBe("parse");
});
test("invalid phase transition throws", () => {
    const ctx = (0, context_1.createContext)({});
    ctx.phase = "parse";
    expect(() => (0, phaseManager_1.setPhase)(ctx, "link")).toThrow(/Invalid phase/);
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testUtils_1 = require("../testUtils");
describe("PEG parser smoke", () => {
    test("basic directives/instructions", () => {
        const src = `
ORG 0x8000
LD A, 10
ADD A, B
LABEL1: NOP
DB 1,2,3
`;
        const ctx = (0, testUtils_1.assembleSource)(testUtils_1.phaseEmit, src, {});
        expect(ctx.errors).toHaveLength(0);
        expect((0, testUtils_1.getBytes)(ctx).length).toBeGreaterThan(0);
    });
});

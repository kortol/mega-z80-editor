"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testUtils_1 = require("../testUtils");
describe("🧩 Loop macros from source", () => {
    test("REPT: source-based loop expansion", () => {
        const src = `
REPT 3
  DB \\#
ENDM
`;
        const ctx = (0, testUtils_1.assembleSource)(testUtils_1.phaseEmit, src, { parser: "peg" });
        console.log(ctx);
        expect(ctx.errors).toHaveLength(0);
        expect((0, testUtils_1.getBytes)(ctx)).toEqual([0, 1, 2]); // DB 0,1,2
    });
    test("Nested REPT: \\##n indexes resolved correctly from source", () => {
        const src = `
REPT 2
  REPT 3
    DB \\##1, \\#
  ENDM
ENDM
`;
        const ctx = (0, testUtils_1.assembleSource)(testUtils_1.phaseEmit, src, { parser: "peg" });
        console.log(ctx);
        expect(ctx.errors).toHaveLength(0);
        expect((0, testUtils_1.getBytes)(ctx)).toEqual([
            0, 0,
            0, 1,
            0, 2,
            1, 0,
            1, 1,
            1, 2,
        ]);
    });
    test("IRP: expands argument list from source", () => {
        const src = `
IRP X, 10, 20, 30
  DB \\X
ENDM
`;
        const ctx = (0, testUtils_1.assembleSource)(testUtils_1.phaseEmit, src, { parser: "peg" });
        expect(ctx.errors).toHaveLength(0);
        expect((0, testUtils_1.getBytes)(ctx)).toEqual([10, 20, 30]);
    });
    test("WHILE: expands until condition false", () => {
        const src = `
X := 0
WHILE X < 3
  DB X
  X := X+1
ENDW
`;
        const ctx = (0, testUtils_1.assembleSource)(testUtils_1.phaseEmit, src, { parser: "peg" });
        expect(ctx.errors).toHaveLength(0);
        expect((0, testUtils_1.getBytes)(ctx)).toEqual([0, 1, 2]);
    });
});

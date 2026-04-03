"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testUtils_1 = require("../testUtils");
describe("macro expands", () => {
    it("macro with args expands correctly", () => {
        const src = `
  LD B,10
FILLZ MACRO COUNT,VAL
  LD B,COUNT
  LD (HL),VAL
  ENDM
FILLZ 10,0
`;
        const ctx = (0, testUtils_1.assembleSource)(testUtils_1.phaseEmit, src, { parser: "peg" });
        // console.log(ctx);
        const txt = ctx.texts.map(t => t.data).flat();
        // console.log(txt);
        expect(txt).toContain(0x06); // LD B,n
        expect(txt).toContain(0x36); // LD (HL),n
    });
});

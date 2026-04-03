"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// packages/cli/src/assembler/__tests__/rel_record.test.ts
const testUtils_1 = require("../testUtils");
const builder_1 = require("../rel/builder");
describe("P1-E: Relocation Record Generation", () => {
    it("should output R record for JP EXT_C", () => {
        const src = `
      JP EXT_C
      NOP
      ;EXT_C: NOP
      END
    `;
        const ctx = (0, testUtils_1.assembleSource)(testUtils_1.phaseEmit, src, {});
        // console.log(ctx);
        const rel = (0, builder_1.buildRelFile)(ctx);
        // console.log(rel);
        const rRecords = rel.records.filter(r => r.kind === "R");
        // console.log(rRecords);
        // ✅ Rレコードが1件あること
        expect(rRecords.length).toBe(1);
        const r = rRecords[0];
        expect(r.sym).toBe("EXT_C");
        expect(r.size).toBe(2);
        expect(r.addr).toBeGreaterThanOrEqual(0);
    });
    it("should not output R for const expression", () => {
        const src = `
      JP 1234H
      END
    `;
        const ctx = (0, testUtils_1.assembleSource)(testUtils_1.phaseAnalyze, src);
        const rel = (0, builder_1.buildRelFile)(ctx);
        const rRecords = rel.records.filter(r => r.kind === "R");
        // ✅ 定数式の場合は出力なし
        expect(rRecords.length).toBe(0);
    });
});

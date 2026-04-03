// packages/cli/src/assembler/__tests__/rel_record.test.ts
import { assembleSource, phaseAnalyze, phaseEmit } from "../testUtils";
import { buildRelFile } from "../rel/builder";

describe("P1-E: Relocation Record Generation", () => {
  it("should output R record for JP EXT_C", () => {
    const src = `
      JP EXT_C
      NOP
      ;EXT_C: NOP
      END
    `;
    const ctx = assembleSource(phaseEmit, src, { parser: "peg" });
    // console.log(ctx);

    const rel = buildRelFile(ctx);
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
    const ctx = assembleSource(phaseAnalyze, src);
    const rel = buildRelFile(ctx);
    const rRecords = rel.records.filter(r => r.kind === "R");

    // ✅ 定数式の場合は出力なし
    expect(rRecords.length).toBe(0);
  });
});

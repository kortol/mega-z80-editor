import { assembleSource } from "../../assembler/testUtils";
import { buildRelFile } from "../../assembler/rel/builder";

describe("P1-E Fixture Integration", () => {
  it("should generate correct number of R records", () => {
    const src = `
      LD HL,(EXT_A)
      LD (EXT_B),A
      JP EXT_C
      CALL EXT_D
      DEFW EXT_E
      END
    `;
    const ctx = assembleSource(src);
    const rel = buildRelFile(ctx);
    const rRecords = rel.records.filter(r => r.kind === "R");

    // 各命令1件ずつ R 出力されていること
    expect(rRecords.length).toBe(5);

    // それぞれのシンボルが正しく出力されているか
    const symbols = rRecords.map(r => r.sym);
    expect(symbols).toEqual(["EXT_A", "EXT_B", "EXT_C", "EXT_D", "EXT_E"]);
  });
});

import * as fs from "fs";
import { assembleSource, phaseAnalyze, phaseEmit } from "../../assembler/testUtils";
import { buildRelFile } from "../../assembler/rel/builder";
import { createContext } from "../../assembler/context";
import { initCodegen } from "../../assembler/codegen/emit";
import { setPhase } from "../../assembler/phaseManager";
import { tokenize } from "../../assembler/tokenizer";
import { parse } from "../../assembler/parser";
import { runAnalyze } from "../../cli/mz80-as";

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
    const ctx = assembleSource(phaseEmit, src);
    const rel = buildRelFile(ctx);
    const rRecords = rel.records.filter(r => r.kind === "R");

    // 各命令1件ずつ R 出力されていること
    expect(rRecords.length).toBe(5);

    // それぞれのシンボルが正しく出力されているか
    const symbols = rRecords.map(r => r.sym);
    expect(symbols).toEqual(["EXT_A", "EXT_B", "EXT_C", "EXT_D", "EXT_E"]);
    const aRec = rRecords.find(r => r.sym === "EXT_A");
    expect(aRec?.addr).toBe(1);
    const eRec = rRecords.find(r => r.sym === "EXT_E");
    expect(eRec?.addr).toBe(12);
  });
});

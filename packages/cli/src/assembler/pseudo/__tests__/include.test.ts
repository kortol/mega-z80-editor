import fs from "fs";
import path from "path";
import { createContext } from "../../context";
import { AssemblerErrorCode } from "../../errors";
import { parsePeg } from "../../../assembler/parser/pegAdapter";
import { runAnalyze } from "../../analyze";
import { assemble } from "../../../cli/mz80-as";
import { createLogger } from "../../../logger";

describe("P2-D-EX-01: INCLUDE loop detection", () => {
  const tmpDir = path.resolve(__dirname, "__tmp_include_loop__");
  const fileA = path.join(tmpDir, "a.asm");
  const fileB = path.join(tmpDir, "b.inc");

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(fileA, 'INCLUDE "b.inc"\nLD A,1\n');
    fs.writeFileSync(fileB, 'INCLUDE "a.asm"\nLD A,2\n');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("detect circular INCLUDE (A→B→A)", () => {
    const ctx = createContext();
    ctx.currentPos.file = fileA;
    const src = fs.readFileSync(fileA, "utf8");
    ctx.nodes = parsePeg(ctx, src);
    let thrown: any;
    try {
      runAnalyze(ctx);
    } catch (err: any) {
      thrown = err;
    }
    expect(thrown).toEqual(
      expect.objectContaining({
        code: AssemblerErrorCode.IncludeLoop,
      })
    );
    expect(ctx.includeStack.length).toBe(0); // stack 復帰確認
  });

  test("restore section after INCLUDE", () => {
    const tmpDir2 = path.resolve(__dirname, "__tmp_include_section__");
    const mainFile = path.join(tmpDir2, "main.asm");
    const subFile = path.join(tmpDir2, "sub.inc");
    const outRel = path.join(tmpDir2, "main.rel");

    fs.mkdirSync(tmpDir2, { recursive: true });
    fs.writeFileSync(subFile, "SECTION DATA\nDB 2\n", "utf8");
    fs.writeFileSync(mainFile, `SECTION TEXT\nINCLUDE "${subFile}"\nDB 1\n`, "utf8");

    const logger = createLogger("quiet");
    const ctx = assemble(logger, mainFile, outRel, { relVersion: 2 });

    const textId = Array.from(ctx.sections.values()).find(s => s.name === ".text")?.id;
    const dataId = Array.from(ctx.sections.values()).find(s => s.name === ".data")?.id;

    const first = ctx.texts[0];
    const last = ctx.texts[ctx.texts.length - 1];

    expect(first.sectionId).toBe(dataId);
    expect(last.sectionId).toBe(textId);

    fs.rmSync(tmpDir2, { recursive: true, force: true });
  });

  test("duplicate INCLUDE is skipped with warning", () => {
    const tmpDir3 = path.resolve(__dirname, "__tmp_include_dup__");
    const mainFile = path.join(tmpDir3, "main.asm");
    const subFile = path.join(tmpDir3, "sub.inc");
    const outRel = path.join(tmpDir3, "main.rel");

    fs.mkdirSync(tmpDir3, { recursive: true });
    fs.writeFileSync(subFile, "DB 9\n", "utf8");
    fs.writeFileSync(mainFile, `INCLUDE "${subFile}"\nINCLUDE "${subFile}"\nDB 1\n`, "utf8");

    const logger = createLogger("quiet");
    const ctx = assemble(logger, mainFile, outRel, { relVersion: 2 });

    expect(ctx.warnings.some(w => w.code === AssemblerErrorCode.IncludeDuplicate)).toBe(true);
    expect(ctx.includeStack.length).toBe(0);

    fs.rmSync(tmpDir3, { recursive: true, force: true });
  });
});

import fs from "fs";
import path from "path";
import { createContext } from "../../context";
import { tokenize } from "../../tokenizer";
import { parse } from "../../parser";
import { AssemblerErrorCode } from "../../errors";

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
    ctx.currentFile = fileA;
    const src = fs.readFileSync(fileA, "utf8");
    const tokens = tokenize(src);
    console.log(ctx);
    expect(() => parse(ctx, tokens)).toThrow(
      expect.objectContaining({
        code: AssemblerErrorCode.IncludeLoop,
      }));
    console.log(ctx);
    expect(ctx.includeStack.length).toBe(0); // stack 復帰確認
  });
});

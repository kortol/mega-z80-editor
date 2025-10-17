import * as fs from "fs";
import * as path from "path";
import { Logger } from "../../logger";
import { assemble } from "../../cli/mz80-as";

describe("P2-D-EX-02: INCLUDE trace in listing", () => {
  const tmpDir = path.resolve(__dirname, "__tmp_include_trace__");
  const fileA = path.join(tmpDir, "main.asm");
  const fileB = path.join(tmpDir, "sub1.inc");
  const fileC = path.join(tmpDir, "sub2.inc");
  const outRel = path.join(tmpDir, "main.rel");
  const outLst = outRel.replace(/\.rel$/, ".lst");

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });

    // --- サブファイル構造を用意 ---
    fs.writeFileSync(fileC, "LD A,3\n", "utf8");
    fs.writeFileSync(fileB, `INCLUDE "${tmpDir}/sub2.inc"\nLD A,2\n`, "utf8");
    fs.writeFileSync(fileA, `INCLUDE "${tmpDir}/sub1.inc"\nLD A,1\n`, "utf8");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("generate LST with include trace", () => {
    const logger = new Logger();
    const ctx = assemble(logger, fileA, outRel, { verbose: false, relVersion: 2 });

    expect(fs.existsSync(outLst)).toBe(true);

    const lst = fs.readFileSync(outLst, "utf8").trimEnd();
    console.log(lst);

    // --- Golden出力（期待値） ---
    const expected = [
      ";#include <main.asm>",
      ";#include <sub1.inc>",
      ";#include <sub2.inc>",
      "0000  3E 03           LD A,3",
      ";#endinclude (sub2.inc)",
      "0002  3E 02           LD A,2",
      ";#endinclude (sub1.inc)",
      "0004  3E 01           LD A,1",
      ";#endinclude (main.asm)"
    ].join("\n");

    // Golden差分テスト
    expect(normalize(lst)).toBe(normalize(expected));
  });
});

// 正規化: 改行・空白を一定化
function normalize(str: string) {
  return str.replace(/\r\n/g, "\n").trim();
}

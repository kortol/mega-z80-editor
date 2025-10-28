import * as fs from "fs";
import * as path from "path";
import { assemble } from "../../cli/mz80-as";
import { link } from "../../cli/mz80-link";
import { JsonRelAdapter } from "../../assembler/rel/adapter";
import { createLogger } from "../../logger";

const TMP_DIR = path.join(__dirname, "tmp");

function readFileText(file: string): string {
  return fs.readFileSync(file, "utf8");
}

describe("P1-C integration fixture", () => {
  const asmFile = path.join(__dirname, "p1c_fixture.asm");
  const relFile = path.join(TMP_DIR, "p1c_fixture.rel");
  const binFile = path.join(TMP_DIR, "p1c_fixture.bin");

  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);
  });

  test("assemble fixture to .rel", () => {
    const logger = createLogger("verbose");
    assemble(logger, asmFile, relFile, {});
    const relText = readFileText(relFile);
    // console.log(relText);

    // JSONアダプタで読み取り
    const relJson = new JsonRelAdapter().write(
      require("../../assembler/rel/builder").buildRelFile
    );

    // .rel の内容をざっくり確認
    expect(relText).toContain("H P1C_FIXTURE".toUpperCase());
    expect(relText).toContain("T 0120"); // ORG 0x120
    expect(relText).toContain("S START");
    expect(relText).toContain("R 2000 EXT+1");
    expect(relText).toContain("R 2001 EXT-1");
    expect(relText).toContain("E 0120"); // entry point
  });

  test("link .rel to .bin", () => {
    link([relFile], binFile, { verbose: false, map: false, sym: false, log: false });

    const bin = fs.readFileSync(binFile);
    expect(bin.length).toBeGreaterThan(0);

    // 先頭にLD A,7 (3E 07) があるか
    // expect(bin.includes(0x3e) && bin.includes(0x07)).toBe(true);
    expect(bin.toString().slice(0, 11)).toBe("0120: 3E 07");
  });
});

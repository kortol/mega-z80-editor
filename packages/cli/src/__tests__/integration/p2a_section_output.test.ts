import fs from "fs";
import path from "path";
import { assemble } from "../../cli/mz80-as";
import { Logger } from "../../logger";

test("SECTION命令で複数セクションをRelV2に出力できる", () => {
  const input = path.join(__dirname, "../../../examples/linktest/test_sections.asm");
  const output = path.join(__dirname, "../../../.tmp_tests/test_sections.rel");
  const logger = new Logger();
  const ctx = assemble(logger, input, output, { relVersion: 2 });

  const buf = fs.readFileSync(output);
  // Magic + version チェック
  expect(buf.slice(0, 4).toString()).toBe("MZ8R");
  expect(buf[4]).toBe(2);

  // ctx.sections 検証
  expect(ctx.sections.size).toBeGreaterThanOrEqual(3);
  const names = Array.from(ctx.sections.values()).map(s => s.name);
  expect(names).toContain(".text");
  expect(names).toContain(".data");
  expect(names).toContain(".bss");

  // 各セクションのデータ長が個別に取れているか
  for (const s of ctx.sections.values()) {
    expect(typeof s.size).toBe("number");
  }
  const text = buf.toString();
  expect(text).toContain("$SECTION 0 .text");
  expect(text).toContain("$SECTION 1 .data");
  expect(text).toContain("$SECTION 2 .bss");
  expect(text).toContain("$TEXT section=.text");
  expect(text).toContain("$TEXT section=.data");
  expect(text).toMatch(/T 0000 3E 00/); // text part
  expect(text).toMatch(/T 0000 11 11/); // data part  

  // RelV2ヘッダ内 sectionCount の整合性（後にparseRelV2実装後チェック）
});

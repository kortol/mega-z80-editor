import fs from "fs";
import path from "path";
import { assemble } from "../../cli/mz80-as";

test("SECTION命令で複数セクションをRelV2に出力できる", () => {
  const input = path.join(__dirname, "../../../examples/linktest/test_sections.asm");
  const output = path.join(__dirname, "../../../.tmp_tests/test_sections.rel");
  const ctx = assemble(input, output, 2, { relVersion: 2 });

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

  // RelV2ヘッダ内 sectionCount の整合性（後にparseRelV2実装後チェック）
});

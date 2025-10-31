import fs from "fs";
import path from "path";
import { assemble } from "../../cli/mz80-as";
import { createLogger } from "../../logger";
import { randomUUID } from "crypto";

describe("BaseTextAdapter", () => {
  const tmpDir = path.resolve(__dirname, '../../.tmp_tests.' + randomUUID());
  const input = path.join(__dirname, "../../../examples/linktest/test_sections.asm");
  const relPath = path.join(tmpDir, "test_sections.rel");
  const symPath = relPath.replace(/\.rel$/, '.sym');
  const lstPath = relPath.replace(/\.rel$/, '.lst');

  beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => fs.existsSync(relPath) && fs.unlinkSync(relPath));
  afterAll(() => {
    if (fs.existsSync(relPath)) {
      fs.unlinkSync(relPath);
    }
    if (fs.existsSync(symPath)) {
      fs.unlinkSync(symPath);
    }
    if (fs.existsSync(lstPath)) {
      fs.unlinkSync(lstPath);
    }
    // 一時ディレクトリも削除
    fs.rmdirSync(tmpDir);
  })

  it("SECTION命令で複数セクションをRelV2に出力できる", () => {

    const logger = createLogger("verbose");

    const ctx = assemble(logger, input, relPath, { relVersion: 2 });

    const buf = fs.readFileSync(relPath);
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
});
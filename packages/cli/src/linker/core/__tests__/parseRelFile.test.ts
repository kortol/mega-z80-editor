// src/linker/core/__tests__/parseRelFile.test.ts
import { randomUUID } from "crypto";
import { parseRelFile } from "../parser";
import * as fs from "fs";
import * as path from "path";
import os from "os";

describe("P1-F: parseRelFile", () => {
  const tmpDir = path.join(os.tmpdir(), "mz80-tests-" + randomUUID());
  const relPath = path.join(tmpDir, "TEST_REL.rel");

  function safeUnlink(p: string) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
  function safeRmdir(p: string) {
    try { fs.rmdirSync(p); } catch { /* ignore */ }
  }

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const content = [
      "H TESTMOD",
      "S LABEL1 0100",
      "T 0100 3E 01",
      "R 0101 EXT1",
      "X EXT1",
      "E 0100"
    ].join("\n");
    fs.writeFileSync(relPath, content);
  });
  afterAll(() => {
    if (fs.existsSync(relPath)) {
      safeUnlink(relPath);
    }
    // 一時ディレクトリも削除
    safeRmdir(tmpDir);
  })

  it("parses .rel file correctly", () => {
    const mod = parseRelFile(relPath);
    expect(mod.name).toBe("TESTMOD");
    expect(mod.symbols[0]).toEqual({ name: "LABEL1", addr: 0x0100 });
    expect(mod.texts[0]).toEqual({ addr: 0x0100, bytes: [0x3E, 0x01] });
    expect(mod.refs[0]).toEqual({ addr: 0x0101, sym: "EXT1" });
    expect(mod.externs).toContain("EXT1");
    expect(mod.entry).toBe(0x0100);
  });
});

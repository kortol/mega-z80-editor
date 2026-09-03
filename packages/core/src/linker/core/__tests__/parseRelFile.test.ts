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
    expect(mod.symbols[0]).toMatchObject({ name: "LABEL1", addr: 0x0100, module: "TESTMOD" });
    expect(mod.texts[0]).toEqual({ addr: 0x0100, bytes: [0x3E, 0x01] });
    expect(mod.refs[0]).toEqual({ addr: 0x0101, sym: "EXT1" });
    expect(mod.externs).toContain("EXT1");
    expect(mod.entry).toBe(0x0100);
  });

  it("parses symbol metadata fields in S records", () => {
    const metaPath = path.join(tmpDir, "TEST_META.rel");
    const content = [
      "H MAIN%20MOD",
      "S START 0100 .text REL module=MAIN%20MOD defFile=src%2Fmain.asm defLine=42",
    ].join("\n");
    fs.writeFileSync(metaPath, content);

    const mod = parseRelFile(metaPath);
    expect(mod.name).toBe("MAIN MOD");
    expect(mod.symbols[0]).toMatchObject({
      name: "START",
      addr: 0x0100,
      section: ".text",
      storage: "REL",
      module: "MAIN MOD",
      defFile: "src/main.asm",
      defLine: 42,
    });

    safeUnlink(metaPath);
  });
});

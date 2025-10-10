// src/linker/core/__tests__/parseRelFile.test.ts
import { parseRelFile } from "../parser";
import * as fs from "fs";
import * as path from "path";

describe("P1-F: parseRelFile", () => {
  const tmp = path.resolve(__dirname, "../../../.tmp_tests");
  const relPath = path.join(tmp, "TEST_REL.rel");

  beforeAll(() => {
    fs.mkdirSync(tmp, { recursive: true });
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

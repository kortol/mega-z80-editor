import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger } from "@mz80/core";
import { compileCFile, compileCSource } from "../../publicApi";

describe("public C compiler API", () => {
  test("compileCFile compiles a source file through the bundled compiler", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-public-c-file-"));
    const inputFile = path.join(tempDir, "main.c");
    const outputRelFile = path.join(tempDir, "main.rel");
    fs.writeFileSync(inputFile, "int main(){ return 0; }\n", "utf8");

    const result = compileCFile(createLogger("quiet"), { inputFile, outputRelFile, tempDir });

    expect(result.relFile).toBe(outputRelFile);
    expect(fs.existsSync(outputRelFile)).toBe(true);
  });

  test("compileCSource stages and compiles source text", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-public-c-source-"));
    const outputRelFile = path.join(tempDir, "source.rel");

    const result = compileCSource(createLogger("quiet"), {
      source: "int main(){ return 0; }\n",
      fileName: "smoke.c",
      outputRelFile,
      tempDir,
    });

    expect(result.inputFile).toBe(path.join(tempDir, "smoke.c"));
    expect(fs.existsSync(outputRelFile)).toBe(true);
  });
});

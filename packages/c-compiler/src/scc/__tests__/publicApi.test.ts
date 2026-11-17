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

  test("numeric feature selection reaches public source API and static-frame bridge", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-public-numeric-"));
    const result = compileCSource(createLogger("quiet"), {
      source: "#include <mz80_fixed.h>\n#include <mz80_bcd.h>\nmz80_q16_16 wide;mz80_bcd decimal;int main(){return mz80_q16_from_int(&wide,7)+mz80_bcd_from_int(&decimal,-7);}",
      tempDir, features: ["fixed", "bcd"], abi: "ts-static-frame",
    });
    expect(fs.existsSync(result.relFile)).toBe(true);
    const preprocessed = fs.readFileSync(result.preprocessedFile, "utf8");
    expect(preprocessed).toContain("mz80_q16_v1_from_int");
    expect(preprocessed).toContain("mz80_bcd_v1_from_int");
  });
});

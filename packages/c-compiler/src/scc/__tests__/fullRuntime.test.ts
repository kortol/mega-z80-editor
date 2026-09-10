import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger, Z80DebugCore } from "@mz80/core";
import { compileSccProgram } from "../compileProgram";
import { TsSccCompilerAdapter } from "../tsCompilerAdapter";

describe("CP/M full runtime", () => {
  test("bundled headers and basic string/ctype routines run through the TS source path", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-full-runtime-"));
    const sourcePath = path.join(tempDir, "full.c");
    const outputPath = path.join(tempDir, "full.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <string.h>",
      "#include <ctype.h>",
      "int main(){ char buffer[16]; char copied[6]; char filled[4]; strcpy(buffer, \"Ab\"); memcpy(copied, \"Cat\", 4); memset(filled, 65, 3); filled[3]=0; strlen(buffer); toupper(98); printf(\"%s %c %% %d %u %x %X %p\\n\", \"Hi\", 65, -12, 34, 42, 42, buffer); printf(\"%s %s %d %d %d %d\\n\", copied, filled, memcmp(\"a\", \"b\", 1), strcmp(\"b\", \"a\"), isalpha(65), tolower(65)); printf(\"%d%d%d%d%d%d\\n\", isdigit(51), islower(97), isupper(65), isspace(9), toupper(98), tolower(65)); sprintf(buffer, \"%s%c%d%x%X\", \"B\", 33, 7, 42, 42); puts(buffer); return 0; }",
      "",
    ].join("\n"));
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(12000);
    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toMatch(/^Hi A % -12 34 2a 2A 0x[0-9a-f]{4}\nCat AAA -1 1 1 97\n11116697\nB!72a2A\n$/);
  });
});

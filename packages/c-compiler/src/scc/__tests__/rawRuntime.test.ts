import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "@mz80/assembler";
import { createLogger, Z80DebugCore } from "@mz80/core";
import { compileSccProgram } from "../compileProgram";
import { TsSccCompilerAdapter } from "../tsCompilerAdapter";
import { translateSccAsm } from "../translateAsm";

function assembleRawHooks(tempDir: string): string {
  const sourcePath = path.join(tempDir, "raw-hooks.scc.asm");
  const asmPath = path.join(tempDir, "raw-hooks.asm");
  const relPath = path.join(tempDir, "raw-hooks.rel");
  fs.writeFileSync(sourcePath, [
    "\t.module\traw_hooks",
    "\t.globl\t__mz80_raw_putc",
    "\t.globl\t__mz80_raw_getc",
    "\t.globl\t__mz80_raw_exit",
    "\t.area\t_CODE",
    "__mz80_raw_putc:",
    "\tld\thl,#2",
    "\tadd\thl,sp",
    "\tld\te,(hl)",
    "\tld\tc,#2",
    "\tcall\t5",
    "\tld\tl,e",
    "\tld\th,#0",
    "\tret",
    "__mz80_raw_getc:",
    "\tld\thl,#0",
    "\tret",
    "__mz80_raw_exit:",
    "\tld\tc,#0",
    "\tcall\t5",
    "\tret",
    "",
  ].join("\n"), "utf8");
  fs.writeFileSync(asmPath, translateSccAsm(fs.readFileSync(sourcePath, "utf8"), { moduleName: "raw_hooks" }), "utf8");
  expect(assemble(createLogger("quiet"), asmPath, relPath, { relVersion: 2, verbose: false }).errors).toEqual([]);
  return relPath;
}

describe("raw bundled runtime", () => {
  test("links user-provided hooks and executes its I/O and exit ABI", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-raw-runtime-"));
    const sourcePath = path.join(tempDir, "raw.c");
    const outputPath = path.join(tempDir, "raw.com");
    fs.writeFileSync(sourcePath, "#include <stdio.h>\nint main(){ puts(\"RAW\"); return 0; }\n", "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "raw", profile: "lite" },
      libraries: [assembleRawHooks(tempDir)],
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(4000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("RAW\n");
  });

  test("links full archive members through user-provided hooks", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-raw-full-runtime-"));
    const sourcePath = path.join(tempDir, "raw-full.c");
    const outputPath = path.join(tempDir, "raw-full.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <string.h>",
      "#include <ctype.h>",
      "int main(){ char text[6]; char tokens[4]; char *hit; char *token; strcpy(text, \"raw\"); memmove(text+1, text, 3); hit=strpbrk(text, \"a\"); strcpy(tokens, \"x,y\"); token=strtok(tokens, \",\"); printf(\"%s %d %c %c %s\\n\", text, strlen(text), toupper(98), hit[0], token); return 0; }",
      "",
    ].join("\n"), "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "raw", profile: "full" },
      libraries: [assembleRawHooks(tempDir)],
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(6000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("rraw 4 B a x\n");
  });

  test("rejects a raw build when any mandatory hook is absent", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-raw-runtime-missing-"));
    const sourcePath = path.join(tempDir, "raw.c");
    fs.writeFileSync(sourcePath, "int main(){ return 0; }\n", "utf8");
    expect(() => compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: path.join(tempDir, "raw.com"),
      runtime: { platform: "raw", profile: "lite" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() })).toThrow("Link requires symbol(s) that were not provided");
  });
});

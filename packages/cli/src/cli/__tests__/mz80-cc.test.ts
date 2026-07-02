import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileSccProgramFromCli } from "../mz80-cc";
import { assemble } from "../../cli/mz80-as";
import { createArchive } from "../../linker/archive";
import { createLogger } from "../../logger";
import { Z80DebugCore } from "../../debugger/core";

function assembleEmitCharArchive(tempDir: string, helperName: string, charCode: number): string {
  const helperAsmPath = path.join(tempDir, `${helperName}.asm`);
  const helperRelPath = path.join(tempDir, `${helperName}.rel`);
  const archivePath = path.join(tempDir, `${helperName}.lib`);
  const helperSource = [
    `PUBLIC ${helperName.toUpperCase()}`,
    "EXTERN OUTCHAR",
    "SECTION TEXT",
    `${helperName.toUpperCase()}:`,
    `\tLD HL,${charCode}`,
    "\tPUSH HL",
    "\tLD A,1",
    "\tCALL OUTCHAR",
    "\tPOP BC",
    "\tLD HL,0",
    "\tRET",
    "END",
    "",
  ].join("\n");
  fs.writeFileSync(helperAsmPath, helperSource, "utf8");
  expect(assemble(createLogger("quiet"), helperAsmPath, helperRelPath, { relVersion: 2 }).errors).toEqual([]);
  createArchive([helperRelPath], archivePath);
  return archivePath;
}

describe("compileSccProgramFromCli", () => {
  test("supports the ts compiler backend and produces a runnable CP/M COM image", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-cli-ts-cc-"));
    const inputFile = path.join(tempDir, "hello.c");
    const outputFile = path.join(tempDir, "hello.com");
    const helperArchive = assembleEmitCharArchive(tempDir, "emitx", 88);

    fs.writeFileSync(inputFile, "int main(){ return emitx(); }\n", "utf8");

    compileSccProgramFromCli(createLogger("quiet"), inputFile, outputFile, {
      compiler: "ts",
      runtime: "cpmcrt",
      library: [helperArchive],
      com: true,
      orgText: "100H",
      sym: true,
      keepTemps: true,
      tempDir,
    });

    expect(fs.existsSync(outputFile)).toBe(true);
    expect(fs.existsSync(outputFile.replace(/\.com$/i, ".sym"))).toBe(true);

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputFile), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("X");
  });
});

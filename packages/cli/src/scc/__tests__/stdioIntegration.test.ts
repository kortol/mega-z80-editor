import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "../../cli/mz80-as";
import { link } from "../../cli/mz80-link";
import { Z80DebugCore } from "../../debugger/core";
import { createArchive } from "../../linker/archive";
import { createLogger } from "../../logger";
import { getBundledSccRuntime } from "../runtime";
import { TsSccCompilerAdapter } from "../tsCompilerAdapter";
import { translateSccAsm } from "../translateAsm";

const logger = createLogger("quiet");

function assembleTranslatedScc(tempDir: string, stem: string, source: string): string {
  const asmPath = path.join(tempDir, `${stem}.asm`);
  const relPath = path.join(tempDir, `${stem}.rel`);
  fs.writeFileSync(asmPath, translateSccAsm(source, { moduleName: `${stem}.i` }), "utf8");
  const ctx = assemble(logger, asmPath, relPath, { relVersion: 2 });
  expect(ctx.errors).toEqual([]);
  return relPath;
}

function assembleMz80Module(tempDir: string, stem: string, source: string): string {
  const asmPath = path.join(tempDir, `${stem}.asm`);
  const relPath = path.join(tempDir, `${stem}.rel`);
  fs.writeFileSync(asmPath, source, "utf8");
  const ctx = assemble(logger, asmPath, relPath, { relVersion: 2 });
  expect(ctx.errors).toEqual([]);
  return relPath;
}

function compileSourceRel(tempDir: string, fileName: string, sourceText: string): string {
  const inputFile = path.join(tempDir, fileName);
  fs.writeFileSync(inputFile, sourceText, "utf8");
  return new TsSccCompilerAdapter().compileToRel(logger, {
    inputFile,
    tempDir,
  }).relFile;
}

function buildStdioArchive(tempDir: string): string {
  const fputsRel = assembleMz80Module(
    tempDir,
    "fputs",
    [
      "SECTION TEXT",
      "PUBLIC FPUTS",
      "EXTERN FPUTC",
      "FPUTS:",
      "\tld hl,2",
      "\tadd hl,sp",
      "\tld e,(hl)",
      "\tinc hl",
      "\tld d,(hl)",
      "FPUTS_LOOP:",
      "\tld a,(de)",
      "\tcp 24H",
      "\tjr z,FPUTS_DONE",
      "\tinc de",
      "\tpush de",
      "\tld l,a",
      "\tld h,0",
      "\tpush hl",
      "\tld hl,1",
      "\tpush hl",
      "\tcall FPUTC",
      "\tpop bc",
      "\tpop bc",
      "\tpop de",
      "\tjr FPUTS_LOOP",
      "FPUTS_DONE:",
      "\tld hl,0",
      "\tret",
      "END",
      "",
    ].join("\n"),
  );

  const fgetsRel = assembleMz80Module(
    tempDir,
    "fgets",
    [
      "SECTION TEXT",
      "PUBLIC FGETS",
      "EXTERN FGETC",
      "FGETS:",
      "\tld hl,2",
      "\tadd hl,sp",
      "\tld e,(hl)",
      "\tinc hl",
      "\tld d,(hl)",
      "\tinc hl",
      "\tld c,(hl)",
      "\tinc hl",
      "\tld b,(hl)",
      "\tpush de",
      "\tld a,b",
      "\tor c",
      "\tjr z,FGETS_EMPTY",
      "\tdec bc",
      "FGETS_LOOP:",
      "\tld a,b",
      "\tor c",
      "\tjr z,FGETS_DONE",
      "\tld hl,0",
      "\tpush hl",
      "\tcall FGETC",
      "\tpop bc",
      "\tld a,l",
      "\tcp 0DH",
      "\tjr z,FGETS_DONE",
      "\tld (de),a",
      "\tinc de",
      "\tdec bc",
      "\tjr FGETS_LOOP",
      "FGETS_EMPTY:",
      "\txor a",
      "\tld (de),a",
      "\tpop hl",
      "\tret",
      "FGETS_DONE:",
      "\txor a",
      "\tld (de),a",
      "\tpop hl",
      "\tret",
      "END",
      "",
    ].join("\n"),
  );

  const getsRel = assembleMz80Module(
    tempDir,
    "gets",
    [
      "SECTION TEXT",
      "PUBLIC GETS",
      "EXTERN FGETC",
      "GETS:",
      "\tld hl,2",
      "\tadd hl,sp",
      "\tld e,(hl)",
      "\tinc hl",
      "\tld d,(hl)",
      "\tpush de",
      "GETS_LOOP:",
      "\tld hl,0",
      "\tpush hl",
      "\tcall FGETC",
      "\tpop bc",
      "\tld a,l",
      "\tcp 0DH",
      "\tjr z,GETS_DONE",
      "\tld (de),a",
      "\tinc de",
      "\tjr GETS_LOOP",
      "GETS_DONE:",
      "\txor a",
      "\tld (de),a",
      "\tpop hl",
      "\tret",
      "END",
      "",
    ].join("\n"),
  );

  const getcharRel = assembleMz80Module(
    tempDir,
    "getchar",
    [
      "SECTION TEXT",
      "PUBLIC GETCHAR",
      "EXTERN FGETC",
      "GETCHAR:",
      "\tld hl,0",
      "\tpush hl",
      "\tcall FGETC",
      "\tpop bc",
      "\tret",
      "END",
      "",
    ].join("\n"),
  );

  const archivePath = path.join(tempDir, "stdio.lib");
  createArchive([fputsRel, fgetsRel, getsRel, getcharRel], archivePath);
  return archivePath;
}

describe("Small-C stdio integration", () => {
  test("cpmlibc runtime and archive stdio library execute CP/M SCC fixtures", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-scc-stdio-"));
    const runtimeRel = assembleTranslatedScc(tempDir, "cpmlibc", getBundledSccRuntime("cpmlibc"));
    const archivePath = buildStdioArchive(tempDir);

    const fputsRel = compileSourceRel(
      tempDir,
      "cpm_fputs.c",
      "int fputs(int fp, int s); int main(){ fputs(1, \"FPUTS OK$\"); return 0; }\n",
    );
    const fputsOut = path.join(tempDir, "cpm_fputs.com");
    link([runtimeRel, fputsRel, archivePath], fputsOut, { com: true, orgText: "100H" });

    const fputsCore = new Z80DebugCore(false);
    fputsCore.setCpm22Enabled(true);
    fputsCore.setAllowOutOfImage(true);
    fputsCore.loadImage(fs.readFileSync(fputsOut), 0x0100);
    fputsCore.setEntry(0x0100);
    const fputsResult = fputsCore.run(4000);

    expect(fputsResult.reason).toBe("BDOS 0: terminate");
    expect(fputsCore.getOutput()).toBe("FPUTS OK");

    const fgetsRel = compileSourceRel(
      tempDir,
      "cpm_fgets.c",
      [
        "int fgets(int fp, int n, int s);",
        "int fputs(int fp, int s);",
        "int main(){",
        "  char buf[16];",
        "  fgets(0, 16, buf);",
        "  fputs(1, buf);",
        "  return 0;",
        "}",
        "",
      ].join("\n"),
    );
    const fgetsOut = path.join(tempDir, "cpm_fgets.com");
    link([runtimeRel, fgetsRel, archivePath], fgetsOut, { com: true, orgText: "100H" });

    const fgetsCore = new Z80DebugCore(false);
    fgetsCore.setCpm22Enabled(true);
    fgetsCore.setAllowOutOfImage(true);
    fgetsCore.setCpmInteractive(true);
    fgetsCore.queueConsoleInput("FETCH$", true);
    fgetsCore.loadImage(fs.readFileSync(fgetsOut), 0x0100);
    fgetsCore.setEntry(0x0100);
    const fgetsResult = fgetsCore.run(4000);

    expect(fgetsResult.reason).toBe("BDOS 0: terminate");
    expect(fgetsCore.getOutput()).toBe("FETCH");

    const getsRel = compileSourceRel(
      tempDir,
      "cpm_gets.c",
      [
        "int gets(int s);",
        "int fputs(int fp, int s);",
        "int main(){",
        "  char buf[16];",
        "  gets(buf);",
        "  fputs(1, buf);",
        "  return 0;",
        "}",
        "",
      ].join("\n"),
    );
    const getsOut = path.join(tempDir, "cpm_gets.com");
    link([runtimeRel, getsRel, archivePath], getsOut, { com: true, orgText: "100H" });

    const getsCore = new Z80DebugCore(false);
    getsCore.setCpm22Enabled(true);
    getsCore.setAllowOutOfImage(true);
    getsCore.setCpmInteractive(true);
    getsCore.queueConsoleInput("LINE$", true);
    getsCore.loadImage(fs.readFileSync(getsOut), 0x0100);
    getsCore.setEntry(0x0100);
    const getsResult = getsCore.run(4000);

    expect(getsResult.reason).toBe("BDOS 0: terminate");
    expect(getsCore.getOutput()).toBe("LINE");

    const getcharRel = compileSourceRel(
      tempDir,
      "cpm_getchar.c",
      "int getchar(); int main(){ getchar(); return 0; }\n",
    );
    const getcharOut = path.join(tempDir, "cpm_getchar.com");
    link([runtimeRel, getcharRel, archivePath], getcharOut, { com: true, orgText: "100H" });

    const getcharCore = new Z80DebugCore(false);
    getcharCore.setCpm22Enabled(true);
    getcharCore.setAllowOutOfImage(true);
    getcharCore.setCpmInteractive(true);
    getcharCore.queueConsoleInput("Z");
    getcharCore.loadImage(fs.readFileSync(getcharOut), 0x0100);
    getcharCore.setEntry(0x0100);
    const getcharResult = getcharCore.run(4000);

    expect(getcharResult.reason).toBe("BDOS 0: terminate");
    expect(getcharCore.createSnapshot().inputQueue).toEqual([]);
  });
});

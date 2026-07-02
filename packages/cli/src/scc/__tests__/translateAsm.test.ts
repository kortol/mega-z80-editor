import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "../../cli/mz80-as";
import { link } from "../../cli/mz80-link";
import { Z80DebugCore } from "../../debugger/core";
import { createLogger } from "../../logger";
import { getBundledSccRuntime } from "../runtime";
import { TsSccCompilerAdapter } from "../tsCompilerAdapter";
import { translateSccAsm } from "../translateAsm";

describe("translateSccAsm", () => {
  test("converts SCC hello-style output to mz80-oriented form", () => {
    const src = [
      "; header",
      "\t.globl\t.gchar,.gint,.pchar,.pint,.bool",
      "\t.globl\tmain",
      "\t.module\thello.i",
      "\t.area\t_CODE",
      "main:",
      ".2:",
      "in8255:",
      "\tld\thl,#4096",
      "\tj\t.2",
      "\tj\tnz,.4",
      "\tcall\t.gint",
      "\t.area\t_DATA",
      '.0:\t.asciz\t"HELLO"',
      "\t.area\t_BSS",
      ".stack:\t.ds\t16",
      "",
    ].join("\n");

    const out = translateSccAsm(src);

    expect(out).toContain("; translated from SCC module hello.i");
    expect(out).toContain("PUBLIC main");
    expect(out).toContain("EXTERN __scc_dot_gchar");
    expect(out).toContain("SECTION TEXT");
    expect(out).toContain("SECTION DATA");
    expect(out).toContain("SECTION BSS");
    expect(out).toContain("__scc_local_2:");
    expect(out).toContain("JP\t__scc_local_2");
    expect(out).toContain("ld\thl,4096");
    expect(out).toContain("JP\tnz,.4");
    expect(out).toContain("__scc_dot_stack:");
    expect(out).toContain('DZ "HELLO"');
    expect(out).toContain("DS 16");
  });

  test("converts dotted globals and location counter updates for runtime-style SCC source", () => {
    const src = [
      "\t.module\t_crt",
      "\t.globl\tmain",
      "\t.globl\t.gint,.pint,.main,.argv",
      "\t.area\t_CODE",
      ".reset:",
      "\tjp\t.start",
      "\t.=.+0x26",
      ".start:",
      "\tld\thl,#.argv",
      "\tcall\tmain",
      "\tret",
      ".gint:\tret",
      ".pint:\tret",
      "\t.area\t_DATA",
      ".main:\t.asciz\t'main'",
      ".argv:\t.dw\t.main",
    ].join("\n");

    const out = translateSccAsm(src);

    expect(out).toContain("PUBLIC __scc_dot_gint");
    expect(out).toContain("__scc_dot_reset:");
    expect(out).toContain("__scc_dot_start:");
    expect(out).toContain("ORG $+0x26");
    expect(out).toContain("ld\thl,__scc_dot_argv");
    expect(out).toContain("__scc_dot_main:         DZ 'main'");
    expect(out).toContain("__scc_dot_argv:         DW __scc_dot_main");
  });

  test("translated hello fixture assembles without undefined dotted externs", () => {
    const src = fs.readFileSync(path.join(__dirname, "fixtures_hello_scc.asm"), "utf8");
    const translated = translateSccAsm(src, { moduleName: "fixtures_hello_scc.asm" });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-scc-asm-"));
    const asmPath = path.join(tempDir, "hello.asm");
    const relPath = path.join(tempDir, "hello.rel");
    fs.writeFileSync(asmPath, translated, "utf8");

    const ctx = assemble(createLogger("quiet"), asmPath, relPath, {
      relVersion: 2,
      sym: true,
      lst: true,
    });

    expect(ctx.errors).toEqual([]);
    expect(ctx.externs.has("__SCC_DOT_PINT")).toBe(true);
    expect(ctx.unresolved.some((entry) => entry.symbol === "__SCC_DOT_PINT")).toBe(true);
    expect(fs.existsSync(relPath)).toBe(true);
  });

  test("translated runtime fixture links with translated hello fixture", () => {
    const runtimeSrc = [
      "\t.module\t_crt",
      "\t.globl\tmain",
      "\t.globl\t.gchar,.gint,.pchar,.pint,.gt,.le",
      "\t.area\t_CODE",
      "START:",
      "\tcall\tmain",
      "\tret",
      ".gchar:",
      "\tld\ta,(hl)",
      "\tld\tl,a",
      "\tld\th,#0",
      "\tret",
      ".gint:",
      "\tld\ta,(hl)",
      "\tinc\thl",
      "\tld\th,(hl)",
      "\tld\tl,a",
      "\tret",
      ".pchar:",
      "\tld\ta,l",
      "\tld\t(de),a",
      "\tret",
      ".pint:",
      "\tld\ta,l",
      "\tld\t(de),a",
      "\tinc\tde",
      "\tld\ta,h",
      "\tld\t(de),a",
      "\tret",
      ".gt:",
      "\tld\th,#0",
      "\tld\tl,#1",
      "\tret",
      ".le:",
      "\tld\th,#0",
      "\tld\tl,#1",
      "\tret",
    ].join("\n");
    const helloSrc = fs.readFileSync(path.join(__dirname, "fixtures_hello_scc.asm"), "utf8");
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-scc-link-"));
    const runtimeAsmPath = path.join(tempDir, "runtime.asm");
    const runtimeRelPath = path.join(tempDir, "runtime.rel");
    const helloAsmPath = path.join(tempDir, "hello.asm");
    const helloRelPath = path.join(tempDir, "hello.rel");
    const outPath = path.join(tempDir, "image.abs");

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(runtimeSrc, { moduleName: "_crt" }), "utf8");
    fs.writeFileSync(helloAsmPath, translateSccAsm(helloSrc, { moduleName: "hello.i" }), "utf8");

    const runtimeCtx = assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 });
    const helloCtx = assemble(createLogger("quiet"), helloAsmPath, helloRelPath, { relVersion: 2 });

    expect(runtimeCtx.errors).toEqual([]);
    expect(helloCtx.errors).toEqual([]);

    link([runtimeRelPath, helloRelPath], outPath, {});

    const out = fs.readFileSync(outPath);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toBe(0xcd);
  });

  test("real 0crt SCC fixture translates, assembles, and links with hello fixture", () => {
    const runtimeSrc = fs.readFileSync(path.join(__dirname, "fixtures_0crt_scc.asm"), "utf8");
    const helloSrc = fs.readFileSync(path.join(__dirname, "fixtures_hello_scc.asm"), "utf8");
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-scc-0crt-"));
    const runtimeAsmPath = path.join(tempDir, "0crt.asm");
    const runtimeRelPath = path.join(tempDir, "0crt.rel");
    const helloAsmPath = path.join(tempDir, "hello.asm");
    const helloRelPath = path.join(tempDir, "hello.rel");
    const outPath = path.join(tempDir, "image.abs");

    const runtimeTranslated = translateSccAsm(runtimeSrc, { moduleName: "0CRT.ASM" });
    fs.writeFileSync(runtimeAsmPath, runtimeTranslated, "utf8");
    fs.writeFileSync(helloAsmPath, translateSccAsm(helloSrc, { moduleName: "hello.i" }), "utf8");

    expect(runtimeTranslated).toContain("__scc_dot_reset:");
    expect(runtimeTranslated).toContain("ORG $+0x26");
    expect(runtimeTranslated).toContain("PUBLIC __scc_dot_gint");
    expect(runtimeTranslated).toContain("__scc_dot_stack:");

    const runtimeCtx = assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 });
    const helloCtx = assemble(createLogger("quiet"), helloAsmPath, helloRelPath, { relVersion: 2 });

    expect(runtimeCtx.errors).toEqual([]);
    expect(helloCtx.errors).toEqual([]);

    link([runtimeRelPath, helloRelPath], outPath, {});

    const out = fs.readFileSync(outPath);
    expect(out.length).toBeGreaterThan(0x80);
    expect(Array.from(out)).toContain(0xc3);
  });

  test("source-generated CP/M SCC output produces a runnable .COM image with BDOS output", () => {
    const runtimeSrc = getBundledSccRuntime("cpmcrt");
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-scc-cpm-"));
    const inputFile = path.join(tempDir, "cpmhello.c");
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helloAsmPath = path.join(tempDir, "cpmhello.asm");
    const helloRelPath = path.join(tempDir, "cpmhello.rel");
    const outPath = path.join(tempDir, "cpmhello.com");

    fs.writeFileSync(inputFile, "int main(){ fputc(35, 1); outstr(\" HELLO, CP/M$\"); return 0; }\n", "utf8");
    const helloBuilt = new TsSccCompilerAdapter().compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });
    const helloSrc = fs.readFileSync(helloBuilt.sccAsmFile, "utf8");

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(runtimeSrc, { moduleName: "cpmcrt" }), "utf8");
    fs.writeFileSync(helloAsmPath, translateSccAsm(helloSrc, { moduleName: "cpmhello.i" }), "utf8");

    const runtimeCtx = assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 });
    const helloCtx = assemble(createLogger("quiet"), helloAsmPath, helloRelPath, { relVersion: 2 });

    expect(runtimeCtx.errors).toEqual([]);
    expect(helloCtx.errors).toEqual([]);

    link([runtimeRelPath, helloRelPath], outPath, { com: true, orgText: "100H" });

    const com = fs.readFileSync(outPath);
    const dump = fs.readFileSync(`${outPath}.dmp`, "utf8");

    expect(com.length).toBeGreaterThan(16);
    expect(dump.startsWith("0100:")).toBe(true);

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(com, 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("# HELLO, CP/M");
  });
});

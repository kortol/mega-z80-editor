import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createArchive } from "../linker/archive";
import { buildProjectTarget } from "../project";
import { createLogger } from "../logger";
import { assemble } from "../cli/mz80-as";
import { Z80DebugCore } from "../debugger/core";

describe("buildProjectTarget", () => {
  test("links bundled runtime and archive libraries declared in config", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-project-"));
    const buildDir = path.join(tempDir, "build");
    const mainAsmPath = path.join(tempDir, "main.asm");
    const greetAsmPath = path.join(tempDir, "greet.asm");
    const greetRelPath = path.join(buildDir, "greet.rel");
    const libPath = path.join(buildDir, "support.lib");
    const configPath = path.join(tempDir, "mz80.yaml");

    fs.mkdirSync(buildDir, { recursive: true });

    fs.writeFileSync(
      mainAsmPath,
      [
        "SECTION TEXT",
        "PUBLIC MAIN",
        "EXTERN GREET",
        "MAIN:",
        "\tCALL GREET",
        "\tRET",
        "END",
        "",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      greetAsmPath,
      [
        "SECTION TEXT",
        "PUBLIC GREET",
        "GREET:",
        "\tLD C,9",
        "\tLD DE,MSG",
        "\tCALL 5",
        "\tRET",
        "SECTION DATA",
        "MSG:",
        "\tDB 'P','R','O','J','E','C','T',' ','O','K','$'",
        "END",
        "",
      ].join("\n"),
      "utf8",
    );

    expect(assemble(createLogger("quiet"), greetAsmPath, greetRelPath, { relVersion: 2 }).errors).toEqual([]);
    createArchive([greetRelPath], libPath);

    fs.writeFileSync(
      configPath,
      [
        "project:",
        "  defaultTarget: demo",
        "targets:",
        "  demo:",
        "    output: build/demo.com",
        "    runtime: cpmlibc",
        "    libraries:",
        "      - build/support.lib",
        "    link:",
        "      com: true",
        "      orgText: 100H",
        "    modules:",
        "      - main.asm",
        "",
      ].join("\n"),
      "utf8",
    );

    const built = buildProjectTarget(configPath, {
      project: { defaultTarget: "demo" },
      targets: {
        demo: {
          output: "build/demo.com",
          runtime: "cpmlibc",
          libraries: ["build/support.lib"],
          link: { com: true, orgText: "100H" },
          modules: ["main.asm"],
        },
      },
    }, undefined, createLogger("quiet"));

    expect(fs.existsSync(built.output)).toBe(true);
    expect(built.runtime?.name).toBe("cpmlibc");
    expect(fs.existsSync(path.join(buildDir, "cpmlibc.rel"))).toBe(true);

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(built.output), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("PROJECT OK");
  });

  test("compiles Small-C modules declared in project config before linking", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-project-scc-"));
    const buildDir = path.join(tempDir, "build");
    const srcPath = path.join(tempDir, "HELLO.C");
    const putsAsmPath = path.join(tempDir, "puts.asm");
    const putsRelPath = path.join(buildDir, "puts.rel");
    const libPath = path.join(buildDir, "libputs.lib");
    const dcppScript = path.join(tempDir, "dcpp.cjs");
    const dcppCmd = path.join(tempDir, "dcpp.cmd");
    const sccScript = path.join(tempDir, "sccz80.cjs");
    const sccCmd = path.join(tempDir, "sccz80.cmd");
    const configPath = path.join(tempDir, "mz80.yaml");

    fs.mkdirSync(buildDir, { recursive: true });

    fs.writeFileSync(srcPath, "main(){puts(\"PROJECT SCC OK\");}\n", "utf8");
    fs.writeFileSync(
      putsAsmPath,
      [
        "SECTION TEXT",
        "PUBLIC PUTS",
        "PUTS:",
        "\tLD HL,2",
        "\tADD HL,SP",
        "\tLD E,(HL)",
        "\tINC HL",
        "\tLD D,(HL)",
        "\tLD C,9",
        "\tCALL 5",
        "\tRET",
        "END",
        "",
      ].join("\n"),
      "utf8",
    );
    expect(assemble(createLogger("quiet"), putsAsmPath, putsRelPath, { relVersion: 2 }).errors).toEqual([]);
    createArchive([putsRelPath], libPath);

    fs.writeFileSync(
      dcppScript,
      [
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        "const args = process.argv.slice(2);",
        "const inputPath = args[args.length - 2];",
        "const outputArg = args[args.length - 1];",
        "const outputPath = path.isAbsolute(outputArg) ? outputArg : path.join(process.cwd(), outputArg);",
        'fs.writeFileSync(outputPath, fs.readFileSync(inputPath, "utf8"), "utf8");',
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      sccScript,
      [
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        "const args = process.argv.slice(2);",
        "const inputPath = args[args.length - 1];",
        "const stem = path.basename(inputPath, path.extname(inputPath)).toLowerCase();",
        "const asmPath = path.join(process.cwd(), `${stem}.asm`);",
        "const source = [",
        '"\\t.globl\\tputs,main",',
        '"\\t.module\\thello.i",',
        '"\\t.area\\t_CODE",',
        '"main:",',
        '"\\tld\\thl,#.0+0",',
        '"\\tpush\\thl",',
        '"\\tcall\\tputs",',
        '"\\tpop\\tbc",',
        '"\\tret",',
        '"\\t.area\\t_DATA",',
        '"\\.0:\\t.ascii\\t\\"PROJECT SCC OK$\\"",',
        '"\\t.area\\t_BSS",',
        '"",',
        "].join(\"\\n\");",
        'fs.writeFileSync(asmPath, source, "utf8");',
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      dcppCmd,
      `@echo off\r\n"${process.execPath}" "%~dp0\\dcpp.cjs" %*\r\n`,
      "utf8",
    );
    fs.writeFileSync(
      sccCmd,
      `@echo off\r\n"${process.execPath}" "%~dp0\\sccz80.cjs" %*\r\n`,
      "utf8",
    );

    const built = buildProjectTarget(configPath, {
      targets: {
        demo: {
          output: "build/demo.com",
          runtime: "cpmlibc",
          modules: ["HELLO.C"],
          cc: {
            dcpp: dcppCmd,
            sccz80: sccCmd,
            libraries: ["build/libputs.lib"],
            keepTemps: true,
          },
          link: { com: true, orgText: "100H" },
        },
      },
    }, "demo", createLogger("quiet"));

    expect(fs.existsSync(built.output)).toBe(true);
    expect(built.modules[0]?.kind).toBe("c");
    expect(fs.existsSync(path.join(buildDir, "hello.rel"))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, ".mz80-scc-demo", "hello", "hello.scc.asm"))).toBe(true);

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(built.output), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("PROJECT SCC OK");
  });

  test("supports multiple C modules, mixed asm modules, and build overrides", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-project-mixed-"));
    const buildDir = path.join(tempDir, "build");
    const mainPath = path.join(tempDir, "MAIN.C");
    const helperPath = path.join(tempDir, "HELPER.C");
    const bannerAsmPath = path.join(tempDir, "banner.asm");
    const putsAsmPath = path.join(tempDir, "puts.asm");
    const putsRelPath = path.join(buildDir, "puts.rel");
    const libPath = path.join(buildDir, "libputs.lib");
    const dcppScript = path.join(tempDir, "dcpp.cjs");
    const dcppCmd = path.join(tempDir, "dcpp.cmd");
    const sccScript = path.join(tempDir, "sccz80.cjs");
    const sccCmd = path.join(tempDir, "sccz80.cmd");
    const configPath = path.join(tempDir, "mz80.yaml");

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(mainPath, "main(){helper();banner();}\n", "utf8");
    fs.writeFileSync(helperPath, "helper(){puts(\"MULTI OK\");}\n", "utf8");
    fs.writeFileSync(
      bannerAsmPath,
      [
        "SECTION TEXT",
        "PUBLIC BANNER",
        "BANNER:",
        "\tRET",
        "END",
        "",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      putsAsmPath,
      [
        "SECTION TEXT",
        "PUBLIC PUTS",
        "PUTS:",
        "\tLD HL,2",
        "\tADD HL,SP",
        "\tLD E,(HL)",
        "\tINC HL",
        "\tLD D,(HL)",
        "\tLD C,9",
        "\tCALL 5",
        "\tRET",
        "END",
        "",
      ].join("\n"),
      "utf8",
    );
    expect(assemble(createLogger("quiet"), putsAsmPath, putsRelPath, { relVersion: 2 }).errors).toEqual([]);
    createArchive([putsRelPath], libPath);

    fs.writeFileSync(
      dcppScript,
      [
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        "const args = process.argv.slice(2);",
        "const inputPath = args[args.length - 2];",
        "const outputArg = args[args.length - 1];",
        "const outputPath = path.isAbsolute(outputArg) ? outputArg : path.join(process.cwd(), outputArg);",
        'fs.writeFileSync(outputPath, fs.readFileSync(inputPath, "utf8"), "utf8");',
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      sccScript,
      [
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        "const args = process.argv.slice(2);",
        "const inputPath = args[args.length - 1];",
        "const stem = path.basename(inputPath, path.extname(inputPath)).toLowerCase();",
        "const asmPath = path.join(process.cwd(), `${stem}.asm`);",
        "const source = stem === 'main' ? [",
        '"\\t.globl\\thelper,banner,main",',
        '"\\t.module\\tmain.i",',
        '"\\t.area\\t_CODE",',
        '"main:",',
        '"\\tcall\\thelper",',
        '"\\tcall\\tbanner",',
        '"\\tret",',
        '"\\t.area\\t_BSS",',
        '"",',
        "] : [",
        '"\\t.globl\\tputs,helper",',
        '"\\t.module\\thelper.i",',
        '"\\t.area\\t_CODE",',
        '"helper:",',
        '"\\tld\\thl,#.0+0",',
        '"\\tpush\\thl",',
        '"\\tcall\\tputs",',
        '"\\tpop\\tbc",',
        '"\\tret",',
        '"\\t.area\\t_DATA",',
        '"\\.0:\\t.ascii\\t\\"MULTI OK$\\"",',
        '"\\t.area\\t_BSS",',
        '"",',
        "];",
        "fs.writeFileSync(asmPath, source.join(\"\\n\"), \"utf8\");",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      dcppCmd,
      `@echo off\r\n"${process.execPath}" "%~dp0\\dcpp.cjs" %*\r\n`,
      "utf8",
    );
    fs.writeFileSync(
      sccCmd,
      `@echo off\r\n"${process.execPath}" "%~dp0\\sccz80.cjs" %*\r\n`,
      "utf8",
    );
    fs.writeFileSync(
      configPath,
      [
        "targets:",
        "  demo:",
        "    output: build/demo.com",
        "    runtime: cpmlibc",
        "    link:",
        "      com: true",
        "      orgText: 100H",
        "    modules:",
        "      - MAIN.C",
        "      - HELPER.C",
        "      - banner.asm",
        "",
      ].join("\n"),
      "utf8",
    );

    const built = buildProjectTarget(configPath, {
      targets: {
        demo: {
          output: "build/demo.com",
          runtime: "cpmlibc",
          link: { com: true, orgText: "100H" },
          modules: ["MAIN.C", "HELPER.C", "banner.asm"],
        },
      },
    }, "demo", createLogger("quiet"), {
      libraries: ["build/libputs.lib"],
      cc: {
        dcpp: dcppCmd,
        sccz80: sccCmd,
        keepTemps: true,
        tracePipeline: true,
      },
    });

    expect(fs.existsSync(built.output)).toBe(true);
    expect(built.modules.map((entry) => entry.kind)).toEqual(["c", "c", "asm"]);
    expect(fs.existsSync(path.join(buildDir, "main.rel"))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, "helper.rel"))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, "banner.rel"))).toBe(true);

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(built.output), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("MULTI OK");
  });
});

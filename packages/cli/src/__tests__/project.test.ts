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
});

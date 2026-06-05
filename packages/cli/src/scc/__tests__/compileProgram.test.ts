import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "../../cli/mz80-as";
import { Z80DebugCore } from "../../debugger/core";
import { createArchive } from "../../linker/archive";
import { createLogger } from "../../logger";
import { compileSccProgram } from "../compileProgram";
import { ExternalSccCompilerAdapter } from "../compilerAdapter";

describe("compileSccProgram", () => {
  test("builds a COM image from Small-C input, bundled runtime, and archive library", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-scc-cc-"));
    const srcPath = path.join(tempDir, "HELLO.C");
    const putsAsmPath = path.join(tempDir, "puts.asm");
    const putsRelPath = path.join(tempDir, "puts.rel");
    const libPath = path.join(tempDir, "libputs.lib");
    const outPath = path.join(tempDir, "hello.com");

    fs.writeFileSync(srcPath, "main(){puts(\"CC OK\");}\n", "utf8");
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

    const invocations: Array<{ command: string; args: string[]; cwd: string }> = [];
    const fakeRunner = (command: string, args: string[], cwd: string, _toolMode: "host" | "wsl") => {
      invocations.push({ command, args: [...args], cwd });
      if (command === "dcpp") {
        const inputPath = args[args.length - 2];
        const outputPath = path.isAbsolute(args[args.length - 1])
          ? args[args.length - 1]
          : path.join(cwd, args[args.length - 1]);
        fs.writeFileSync(outputPath, fs.readFileSync(inputPath, "utf8"), "utf8");
        return;
      }
      if (command === "sccz80") {
        fs.writeFileSync(
          path.join(cwd, "hello.asm"),
          [
            "\t.globl\tputs",
            "\t.globl\tmain",
            "\t.module\thello.i",
            "\t.area\t_CODE",
            "main:",
            "\tld\thl,#.0+0",
            "\tpush\thl",
            "\tld\ta,#1",
            "\tcall\tputs",
            "\tpop\tbc",
            "\tret",
            "\t.area\t_DATA",
            '.0:\t.ascii\t"CC OK$"',
            "\t.area\t_BSS",
            "",
          ].join("\n"),
          "utf8",
        );
        return;
      }
      throw new Error(`unexpected tool: ${command}`);
    };

    const built = compileSccProgram(createLogger("quiet"), {
      inputFile: srcPath,
      outputFile: outPath,
      runtime: "cpmlibc",
      libraries: [libPath],
      tempDir,
      keepTemps: true,
    }, {
      compilerAdapter: new ExternalSccCompilerAdapter({
        runTool: fakeRunner,
      }),
    });

    expect(fs.existsSync(built.outputFile)).toBe(true);
    expect(built.runtimeRelFile).toBe(path.join(tempDir, "cpmlibc.rel"));
    expect(invocations.map((entry) => entry.command)).toEqual(["dcpp", "sccz80"]);

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("CC OK");
  });
});

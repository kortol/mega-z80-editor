import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "../../cli/mz80-as";
import { link } from "../../cli/mz80-link";
import { createLogger } from "../../logger";
import { buildSccLibrary } from "../buildLibrary";

describe("buildSccLibrary", () => {
  test("builds an archive from fake SCC tools and links against it", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-scc-lib-build-"));
    const includeDir = path.join(tempDir, "include");
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(includeDir, { recursive: true });
    fs.mkdirSync(srcDir, { recursive: true });

    const fputcPath = path.join(srcDir, "FPUTC.C");
    const fputsPath = path.join(srcDir, "FPUTS.C");
    fs.writeFileSync(fputcPath, "fputc(c, fp) char c; char *fp; { }\n", "utf8");
    fs.writeFileSync(fputsPath, "fputs(s, fp) char *s; char *fp; { }\n", "utf8");

    const invocations: Array<{ command: string; args: string[]; cwd: string; toolMode: "host" | "wsl" }> = [];
    const fakeRunner = (command: string, args: string[], cwd: string, toolMode: "host" | "wsl") => {
      invocations.push({ command, args: [...args], cwd, toolMode });
      if (command === "dcpp") {
        const inputPath = args[args.length - 2];
        const outputPath = path.isAbsolute(args[args.length - 1])
          ? args[args.length - 1]
          : path.join(cwd, args[args.length - 1]);
        fs.writeFileSync(outputPath, fs.readFileSync(inputPath, "utf8"), "utf8");
        return;
      }
      if (command === "sccz80") {
        const inputPath = args[args.length - 1];
        const stem = path.basename(inputPath, path.extname(inputPath)).toLowerCase();
        const asmPath = path.join(cwd, `${stem}.asm`);
        const source = stem === "fputs"
          ? [
            "\t.globl\tfputs,fputc",
            "\t.module\tfputs.i",
            "\t.area\t_CODE",
            "fputs:",
            "\tjp\tfputc",
            "",
          ].join("\n")
          : [
            "\t.globl\tfputc",
            "\t.module\tfputc.i",
            "\t.area\t_CODE",
            "fputc:",
            "\tret",
            "",
          ].join("\n");
        fs.writeFileSync(asmPath, source, "utf8");
        return;
      }
      throw new Error(`unexpected tool: ${command}`);
    };

    const archivePath = path.join(tempDir, "libcpm.lib");
    const build = buildSccLibrary(createLogger("quiet"), {
      outputFile: archivePath,
      inputFiles: [fputcPath, fputsPath],
      includeDirs: [includeDir],
      tempDir: path.join(tempDir, "work"),
      verbose: false,
    }, {
      runTool: fakeRunner,
    });

    expect(build.archivePath).toBe(archivePath);
    expect(fs.existsSync(archivePath)).toBe(true);
    expect(invocations[0].args[0]).toBe(`-I${includeDir}`);
    expect(invocations.every((entry) => entry.toolMode === "host")).toBe(true);

    const mainAsmPath = path.join(tempDir, "main.asm");
    const mainRelPath = path.join(tempDir, "main.rel");
    const outPath = path.join(tempDir, "main.com");
    fs.writeFileSync(
      mainAsmPath,
      [
        "SECTION TEXT",
        "PUBLIC MAIN",
        "EXTERN FPUTS",
        "MAIN:",
        "\tJP FPUTS",
        "END",
        "",
      ].join("\n"),
      "utf8",
    );

    expect(assemble(createLogger("quiet"), mainAsmPath, mainRelPath, { relVersion: 2 }).errors).toEqual([]);
    link([mainRelPath, archivePath], outPath, { com: true, orgText: "100H" });

    expect(Array.from(fs.readFileSync(outPath))).toEqual([0xc3, 0x03, 0x01, 0xc3, 0x06, 0x01, 0xc9]);
  });

  test("passes through WSL tool mode to the external runner", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-scc-lib-wsl-"));
    const sourcePath = path.join(tempDir, "PUTCHAR.C");
    fs.writeFileSync(sourcePath, "putchar(c) char c; { }\n", "utf8");

    const invocations: Array<{ command: string; toolMode: "host" | "wsl" }> = [];
    const fakeRunner = (command: string, args: string[], cwd: string, toolMode: "host" | "wsl") => {
      invocations.push({ command, toolMode });
      if (command === "dcpp") {
        const outputPath = path.isAbsolute(args[args.length - 1])
          ? args[args.length - 1]
          : path.join(cwd, args[args.length - 1]);
        fs.writeFileSync(outputPath, "", "utf8");
        return;
      }
      fs.writeFileSync(path.join(cwd, "putchar.asm"), "\t.globl\tputchar\n\t.module\tputchar.i\n\t.area\t_CODE\nputchar:\n\tret\n", "utf8");
    };

    buildSccLibrary(createLogger("quiet"), {
      outputFile: path.join(tempDir, "libcpm.lib"),
      inputFiles: [sourcePath],
      tempDir: path.join(tempDir, "work"),
      toolMode: "wsl",
    }, {
      runTool: fakeRunner,
    });

    expect(invocations.map((entry) => entry.toolMode)).toEqual(["wsl", "wsl"]);
  });
});

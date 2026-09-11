import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger, loadArchiveFile } from "@mz80/core";
import { assemble } from "@mz80/assembler";
import { writeSccRuntimeFile } from "../../runtime-cli";
import { getBundledRuntimeDefines, getBundledSccRuntime, normalizeBundledRuntime, runtimeId } from "../runtime";
import { getBundledRuntimeArtifacts } from "../runtimeArtifacts";
import { translateSccAsm } from "../translateAsm";

describe("bundled SCC runtimes", () => {
  test("cpmcrt runtime contains expected exported entry points", () => {
    const source = getBundledSccRuntime("cpmcrt");
    expect(source).toContain("\t.globl\texit");
    expect(source).toContain("\t.globl\tputchar");
    expect(source).toContain("\t.globl\toutchar");
    expect(source).toContain("\t.globl\tgetchar");
    expect(source).toContain("\t.globl\tfputc");
    expect(source).toContain("\t.globl\tfgetc");
    expect(source).toContain("\t.globl\t.gchar");
    expect(source).toContain("\t.globl\toutstr");
    expect(source).toContain("\t.globl\tputs");
    expect(source).toContain("START:");
    expect(source).toContain("outchar:");
    expect(source).toContain("fputc:");
    expect(source).toContain("fgetc:");
    expect(source).toContain("puts:");
  });

  test("cpmlibc runtime exposes only low-level stdio primitives", () => {
    const source = getBundledSccRuntime("cpmlibc");
    expect(source).toContain("\t.globl\texit");
    expect(source).toContain("\t.globl\tfputc");
    expect(source).toContain("\t.globl\tfgetc");
    expect(source).toContain("\t.globl\t.gchar");
    expect(source).toContain("\t.globl\t.gint");
    expect(source).toContain("\t.globl\t.pchar");
    expect(source).toContain("\t.globl\t.pint");
    expect(source).not.toContain("\t.globl\tputchar");
    expect(source).not.toContain("\t.globl\tputs");
  });

  test("CLI runtime writer copies bundled runtime source", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-scc-runtime-"));
    const outPath = path.join(tempDir, "cpmcrt.scc.asm");

    writeSccRuntimeFile(createLogger("quiet"), "cpmcrt", outPath);

    expect(fs.readFileSync(outPath, "utf8")).toBe(getBundledSccRuntime("cpmcrt"));
  });

  test("structured CP/M lite selection retains the legacy cpmcrt feature set", () => {
    const source = getBundledSccRuntime({ platform: "cpm", profile: "lite" });
    expect(source).toContain("\t.globl\tputchar");
    expect(source).toContain("puts:");
    expect(getBundledRuntimeDefines({ platform: "cpm", profile: "lite" })).toEqual({ MZ80_PLATFORM_CPM: "1", MZ80_RUNTIME_LITE: "1" });
    expect(runtimeId({ platform: "cpm", profile: "lite" })).toBe("cpm-lite");
    expect(normalizeBundledRuntime("cpmcrt")).toEqual({ platform: "cpm", profile: "lite" });
  });

  test("MSX runtime substitutes the configured exit ABI", () => {
    expect(getBundledSccRuntime({ platform: "msx-bios", profile: "lite", exit: "return" })).toContain("exit:\n\tret");
    expect(getBundledSccRuntime({ platform: "msx-bios", profile: "lite" })).toContain(".halt_loop:");
  });

  test("structured profiles resolve prebuilt CRT and archive artifacts", () => {
    const cpmFull = getBundledRuntimeArtifacts({ platform: "cpm", profile: "full" });
    expect(path.basename(cpmFull.crtRelPath)).toBe("cpm-lite-crt.rel");
    expect(cpmFull.libraryPaths.map((entry) => path.basename(entry))).toEqual(["libmz80c-full.lib"]);
    for (const artifact of [cpmFull.crtRelPath, ...cpmFull.libraryPaths]) {
      expect(fs.existsSync(artifact)).toBe(true);
    }
    expect(loadArchiveFile(cpmFull.libraryPaths[0]).members.map((member) => member.name)).toEqual([
      "mz80c-stdlib.rel",
      "mz80c-string.rel",
      "mz80c-ctype.rel",
      "mz80c-stdio.rel",
    ]);

    const rawLite = getBundledRuntimeArtifacts({ platform: "raw", profile: "lite" });
    expect(path.basename(rawLite.crtRelPath)).toBe("raw-lite-crt.rel");
    expect(rawLite.requiredSymbols).toEqual(["__mz80_raw_putc", "__mz80_raw_getc", "__mz80_raw_exit"]);
  });

  test.each([
    { platform: "cpm", profile: "lite" } as const,
    { platform: "msx-bios", profile: "lite", exit: "halt" } as const,
    { platform: "msx-bios", profile: "lite", exit: "return" } as const,
    { platform: "raw", profile: "lite" } as const,
    { platform: "cpm", profile: "full" } as const,
    { platform: "msx-bios", profile: "full", exit: "return" } as const,
    { platform: "raw", profile: "full" } as const,
  ])("%o lite runtime translates and assembles", (runtime) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-runtime-abi-"));
    const asmPath = path.join(tempDir, `${runtimeId(runtime)}.asm`);
    const relPath = path.join(tempDir, `${runtimeId(runtime)}.rel`);
    fs.writeFileSync(asmPath, translateSccAsm(getBundledSccRuntime(runtime), { moduleName: runtimeId(runtime) }), "utf8");
    const context = assemble(createLogger("quiet"), asmPath, relPath, { relVersion: 2, verbose: false });
    expect(context.errors).toEqual([]);
  });
});

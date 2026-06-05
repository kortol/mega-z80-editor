import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger } from "../../logger";
import { writeSccRuntimeFile } from "../../cli/mz80-scc-runtime";
import { getBundledSccRuntime } from "../runtime";

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
});

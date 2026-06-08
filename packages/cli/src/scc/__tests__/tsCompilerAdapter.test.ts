import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { link } from "../../cli/mz80-link";
import { Z80DebugCore } from "../../debugger/core";
import { createLogger } from "../../logger";
import { getBundledSccRuntime } from "../runtime";
import { TsSccCompilerAdapter } from "../tsCompilerAdapter";
import { translateSccAsm } from "../translateAsm";
import { assemble } from "../../cli/mz80-as";
import { readSccFixture } from "../fixtures";

describe("TsSccCompilerAdapter", () => {
  test("throws a migration-focused error when no fixture-backed implementation is selected", () => {
    const adapter = new TsSccCompilerAdapter();

    expect(() => adapter.compileToRel(createLogger("quiet"), {
      inputFile: path.join(os.tmpdir(), "hello.c"),
      tempDir: path.join(os.tmpdir(), "mz80-ts-scc"),
    })).toThrow(/TsSccCompilerAdapter is not implemented/);
  });

  test("fixture-backed fragment mode materializes SCC outputs instead of throwing", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-frag-string-"));
    const adapter = new TsSccCompilerAdapter({ fixtureId: "frag-string-scc" });
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "frag-string.c"),
      tempDir,
    });

    expect(fs.existsSync(built.sccAsmFile)).toBe(true);
    expect(fs.readFileSync(built.sccAsmFile, "utf8")).toBe(readSccFixture("frag-string-scc"));
    expect(fs.existsSync(built.relFile)).toBe(true);
  });

  test("can materialize a rel from the frag-call fixture", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-frag-call-"));
    const adapter = new TsSccCompilerAdapter({ fixtureId: "frag-call-scc" });
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "frag-call.c"),
      tempDir,
    });

    expect(fs.existsSync(built.sccAsmFile)).toBe(true);
    expect(fs.existsSync(built.asmFile)).toBe(true);
    expect(fs.existsSync(built.relFile)).toBe(true);
    expect(fs.readFileSync(built.sccAsmFile, "utf8")).toBe(readSccFixture("frag-call-scc"));
  });

  test("can materialize a rel from the frag-helper-call fixture", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-frag-helper-"));
    const adapter = new TsSccCompilerAdapter({ fixtureId: "frag-helper-call-scc" });
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "frag-helper.c"),
      tempDir,
    });

    expect(fs.existsSync(built.relFile)).toBe(true);
    expect(fs.readFileSync(built.sccAsmFile, "utf8")).toBe(readSccFixture("frag-helper-call-scc"));
  });

  test("frag-call fixture can link against bundled CP/M runtime", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-frag-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const programRel = new TsSccCompilerAdapter({ fixtureId: "frag-call-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "frag-call.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "frag-call.abs");

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, programRel], outPath, {});

    const image = fs.readFileSync(outPath);
    expect(image.length).toBeGreaterThan(0);
    expect(Array.from(image)).toContain(0xcd);
  });

  test("statement-level outstr fixture links and produces CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-outstr-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-outstr.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-outstr.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_outstr", "stmt_outstr.scc.asm"), "utf8")).toBe(readSccFixture("stmt-outstr-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toContain("TS STMT");
  });
});

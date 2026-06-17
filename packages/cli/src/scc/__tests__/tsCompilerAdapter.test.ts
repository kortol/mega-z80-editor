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

function assembleCompareHelperRuntime(tempDir: string): string {
  const helperAsmPath = path.join(tempDir, "compare-helper.asm");
  const helperRelPath = path.join(tempDir, "gt-helper.rel");
  const helperSource = [
    "\t.globl\t.gt",
    "\t.globl\t.eq",
    "\t.globl\t.ne",
    "\t.module\tgt_helper",
    "\t.area\t_CODE",
    ".gt:",
    "\tld\ta,d",
    "\tcp\th",
    "\tjr\tc,.false",
    "\tjr\tnz,.true",
    "\tld\ta,e",
    "\tcp\tl",
    "\tjr\tc,.false",
    "\tjr\tz,.false",
    ".true:",
    "\tld\thl,#1",
    "\tret",
    ".false:",
    "\tld\thl,#0",
    "\tret",
    ".eq:",
    "\tld\ta,d",
    "\tcp\th",
    "\tjr\tnz,.neq",
    "\tld\ta,e",
    "\tcp\tl",
    "\tjr\tnz,.neq",
    "\tld\thl,#1",
    "\tret",
    ".neq:",
    "\tld\thl,#0",
    "\tret",
    ".ne:",
    "\tld\ta,d",
    "\tcp\th",
    "\tjr\tnz,.diff",
    "\tld\ta,e",
    "\tcp\tl",
    "\tjr\tz,.same",
    ".diff:",
    "\tld\thl,#1",
    "\tret",
    ".same:",
    "\tld\thl,#0",
    "\tret",
    "",
  ].join("\n");
  fs.writeFileSync(helperAsmPath, translateSccAsm(helperSource, { moduleName: "gt_helper" }), "utf8");
  expect(assemble(createLogger("quiet"), helperAsmPath, helperRelPath, { relVersion: 2 }).errors).toEqual([]);
  return helperRelPath;
}

function assemblePickFirst16Runtime(tempDir: string): string {
  const helperAsmPath = path.join(tempDir, "pickfirst16.asm");
  const helperRelPath = path.join(tempDir, "pickfirst16.rel");
  const helperSource = [
    "\t.globl\tpickfirst16",
    "\t.module\tpickfirst16",
    "\t.area\t_CODE",
    "pickfirst16:",
    "\tld\thl,#4",
    "\tadd\thl,sp",
    "\tld\ta,(hl)",
    "\tinc\thl",
    "\tld\th,(hl)",
    "\tld\tl,a",
    "\tret",
    "",
  ].join("\n");
  fs.writeFileSync(helperAsmPath, translateSccAsm(helperSource, { moduleName: "pickfirst16" }), "utf8");
  expect(assemble(createLogger("quiet"), helperAsmPath, helperRelPath, { relVersion: 2 }).errors).toEqual([]);
  return helperRelPath;
}

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

  test("statement-level internal call result fixture links and produces CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-call-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-call-result-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-call-result.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-call-result.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_call_result", "stmt_call_result.scc.asm"), "utf8")).toBe(readSccFixture("stmt-call-result-scc"));

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
    expect(core.getOutput()).toBe("X");
  });

  test("statement-level branch fixture links and takes the true branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-branch-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-branch-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-branch.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-branch.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_branch", "stmt_branch.scc.asm"), "utf8")).toBe(readSccFixture("stmt-branch-scc"));

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
    expect(core.getOutput()).toBe("T");
  });

  test("statement-level local slot fixture links and round-trips stack-relative storage", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-local-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-local-slot-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-local-slot.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-local-slot.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_local_slot", "stmt_local_slot.scc.asm"), "utf8")).toBe(readSccFixture("stmt-local-slot-scc"));

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
    expect(core.getOutput()).toBe("L");
  });

  test("statement-level compare helper fixture links and takes the true branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-compare-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-compare-helper-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-compare-helper.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-compare-helper.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_compare_helper", "stmt_compare_helper.scc.asm"), "utf8")).toBe(readSccFixture("stmt-compare-helper-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, helperRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("Y");
  });

  test("statement-level local compare fixture links and uses stack-relative value in helper compare", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-local-compare-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-local-compare-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-local-compare.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-local-compare.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_local_compare", "stmt_local_compare.scc.asm"), "utf8")).toBe(readSccFixture("stmt-local-compare-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, helperRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("W");
  });

  test("statement-level local int fixture links and round-trips 2-byte stack-relative storage", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-local-int-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-local-int-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-local-int.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-local-int.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_local_int", "stmt_local_int.scc.asm"), "utf8")).toBe(readSccFixture("stmt-local-int-scc"));

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
    expect(core.getOutput()).toBe("Z");
  });

  test("statement-level eq helper fixture links and takes the equal branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-eq-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-eq-helper-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-eq-helper.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-eq-helper.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_eq_helper", "stmt_eq_helper.scc.asm"), "utf8")).toBe(readSccFixture("stmt-eq-helper-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, helperRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("E");
  });

  test("statement-level loop fixture links and emits a countdown via back-edge branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-loop-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-loop-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-loop.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-loop.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_loop", "stmt_loop.scc.asm"), "utf8")).toBe(readSccFixture("stmt-loop-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, helperRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(4000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("321");
  });

  test("statement-level arg char fixture reads a stack argument and returns it", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-arg-char-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-arg-char-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-arg-char.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-arg-char.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_arg_char", "stmt_arg_char.scc.asm"), "utf8")).toBe(readSccFixture("stmt-arg-char-scc"));

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
    expect(core.getOutput()).toBe("A");
  });

  test("statement-level arg ne helper fixture reads an argument and takes the non-equal branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-arg-ne-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-arg-ne-helper-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-arg-ne-helper.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-arg-ne-helper.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_arg_ne_helper", "stmt_arg_ne_helper.scc.asm"), "utf8")).toBe(readSccFixture("stmt-arg-ne-helper-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, helperRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("N");
  });

  test("statement-level arg int fixture reads a 2-byte stack argument and returns it", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-arg-int-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-arg-int-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-arg-int.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-arg-int.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_arg_int", "stmt_arg_int.scc.asm"), "utf8")).toBe(readSccFixture("stmt-arg-int-scc"));

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
    expect(core.getOutput()).toBe("Z");
  });

  test("statement-level two-arg char fixture reads the older stack argument via a larger offset", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-two-arg-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-two-arg-char-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-two-arg-char.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-two-arg-char.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_two_arg_char", "stmt_two_arg_char.scc.asm"), "utf8")).toBe(readSccFixture("stmt-two-arg-char-scc"));

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
    expect(core.getOutput()).toBe("A");
  });

  test("statement-level arg int eq helper fixture compares a 2-byte argument and takes the equal branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-arg-int-eq-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-arg-int-eq-helper-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-arg-int-eq-helper.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-arg-int-eq-helper.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_arg_int_eq_helper", "stmt_arg_int_eq_helper.scc.asm"), "utf8")).toBe(readSccFixture("stmt-arg-int-eq-helper-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, helperRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("I");
  });

  test("statement-level two-arg ne helper fixture compares both stack arguments and takes the non-equal branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-two-arg-ne-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-two-arg-ne-helper-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-two-arg-ne-helper.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-two-arg-ne-helper.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_two_arg_ne_helper", "stmt_two_arg_ne_helper.scc.asm"), "utf8")).toBe(readSccFixture("stmt-two-arg-ne-helper-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, helperRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("D");
  });

  test("statement-level mixed two-arg call fixture evaluates a local caller expression before pushing arguments", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-call-two-arg-mixed-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-call-two-arg-mixed-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-call-two-arg-mixed.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-call-two-arg-mixed.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_call_two_arg_mixed", "stmt_call_two_arg_mixed.scc.asm"), "utf8")).toBe(readSccFixture("stmt-call-two-arg-mixed-scc"));

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
    expect(core.getOutput()).toBe("C");
  });

  test("statement-level local two-arg ne helper fixture compares a caller local against a constant argument", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-two-arg-local-ne-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-two-arg-local-ne-helper-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-two-arg-local-ne-helper.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-two-arg-local-ne-helper.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_two_arg_local_ne_helper", "stmt_two_arg_local_ne_helper.scc.asm"), "utf8")).toBe(readSccFixture("stmt-two-arg-local-ne-helper-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, helperRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("M");
  });

  test("statement-level local int vs arg int eq helper fixture compares a callee-local 16-bit slot against a 16-bit argument", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-local-int-arg-int-eq-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-local-int-arg-int-eq-helper-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-local-int-arg-int-eq-helper.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-local-int-arg-int-eq-helper.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_local_int_arg_int_eq_helper", "stmt_local_int_arg_int_eq_helper.scc.asm"), "utf8")).toBe(readSccFixture("stmt-local-int-arg-int-eq-helper-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, helperRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("Q");
  });

  test("statement-level local int vs arg int ne helper fixture compares a callee-local 16-bit slot against a different 16-bit argument", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-local-int-arg-int-ne-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-local-int-arg-int-ne-helper-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-local-int-arg-int-ne-helper.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-local-int-arg-int-ne-helper.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_local_int_arg_int_ne_helper", "stmt_local_int_arg_int_ne_helper.scc.asm"), "utf8")).toBe(readSccFixture("stmt-local-int-arg-int-ne-helper-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, helperRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("R");
  });

  test("statement-level mixed two-arg int call fixture evaluates a local 16-bit caller expression before pushing arguments", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-call-two-arg-int-mixed-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-call-two-arg-int-mixed-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-call-two-arg-int-mixed.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-call-two-arg-int-mixed.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_call_two_arg_int_mixed", "stmt_call_two_arg_int_mixed.scc.asm"), "utf8")).toBe(readSccFixture("stmt-call-two-arg-int-mixed-scc"));

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
    expect(core.getOutput()).toBe("S");
  });

  test("statement-level local int vs arg int gt helper fixture compares a larger callee-local 16-bit slot against a smaller 16-bit argument", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-local-int-arg-int-gt-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-local-int-arg-int-gt-helper-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-local-int-arg-int-gt-helper.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-local-int-arg-int-gt-helper.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_local_int_arg_int_gt_helper", "stmt_local_int_arg_int_gt_helper.scc.asm"), "utf8")).toBe(readSccFixture("stmt-local-int-arg-int-gt-helper-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, helperRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("T");
  });

  test("statement-level extern two-arg int call fixture pushes a local 16-bit value and calls an external routine", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-extern-two-arg-int-link-"));
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const helperRelPath = assemblePickFirst16Runtime(tempDir);
    const programRel = new TsSccCompilerAdapter({ fixtureId: "stmt-extern-two-arg-int-call-scc" }).compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "stmt-extern-two-arg-int-call.c"),
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-extern-two-arg-int-call.com");

    expect(fs.readFileSync(path.join(tempDir, "stmt_extern_two_arg_int_call", "stmt_extern_two_arg_int_call.scc.asm"), "utf8")).toBe(readSccFixture("stmt-extern-two-arg-int-call-scc"));

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, helperRelPath, programRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("U");
  });
});

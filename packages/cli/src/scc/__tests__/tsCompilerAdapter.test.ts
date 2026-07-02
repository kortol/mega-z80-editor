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
    "\t.globl\t.lt",
    "\t.globl\t.ge",
    "\t.globl\t.le",
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
    ".lt:",
    "\tld\ta,d",
    "\tcp\th",
    "\tjr\tc,.lt_true",
    "\tjr\tnz,.lt_false",
    "\tld\ta,e",
    "\tcp\tl",
    "\tjr\tc,.lt_true",
    "\tjr\tz,.lt_false",
    ".lt_false:",
    "\tld\thl,#0",
    "\tret",
    ".lt_true:",
    "\tld\thl,#1",
    "\tret",
    ".ge:",
    "\tcall\t.lt",
    "\tld\ta,h",
    "\tor\tl",
    "\tjr\tz,.ge_true",
    "\tld\thl,#0",
    "\tret",
    ".ge_true:",
    "\tld\thl,#1",
    "\tret",
    ".le:",
    "\tcall\t.gt",
    "\tld\ta,h",
    "\tor\tl",
    "\tjr\tz,.le_true",
    "\tld\thl,#0",
    "\tret",
    ".le_true:",
    "\tld\thl,#1",
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

function assembleEmitCharRuntime(tempDir: string, helperName: string, charCode: number): string {
  const helperAsmPath = path.join(tempDir, `${helperName}.asm`);
  const helperRelPath = path.join(tempDir, `${helperName}.rel`);
  const helperSource = [
    `\t.globl\t${helperName}`,
    "\t.globl\toutchar",
    `\t.module\t${helperName}`,
    "\t.area\t_CODE",
    `${helperName}:`,
    `\tld\thl,#${charCode}`,
    "\tpush\thl",
    "\tld\ta,#1",
    "\tcall\toutchar",
    "\tpop\tbc",
    "\tld\thl,#0",
    "\tret",
    "",
  ].join("\n");
  fs.writeFileSync(helperAsmPath, translateSccAsm(helperSource, { moduleName: helperName }), "utf8");
  expect(assemble(createLogger("quiet"), helperAsmPath, helperRelPath, { relVersion: 2 }).errors).toEqual([]);
  return helperRelPath;
}

describe("TsSccCompilerAdapter", () => {
  test("source mode materializes a rel for a minimal return-const program", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-return-"));
    const inputFile = path.join(tempDir, "return-const.c");
    fs.writeFileSync(inputFile, "int main(){ return 42; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    expect(fs.existsSync(built.sccAsmFile)).toBe(true);
    expect(fs.readFileSync(built.sccAsmFile, "utf8")).toContain("main:");
    expect(fs.readFileSync(built.sccAsmFile, "utf8")).toContain("\tld\thl,#42");
    expect(fs.readFileSync(built.preprocessedFile, "utf8")).toContain("int main(){ return 42; }");
  });

  test("source mode supports internal zero-arg calls in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-call-"));
    const inputFile = path.join(tempDir, "return-call.c");
    fs.writeFileSync(inputFile, "int value(){ return 88; }\nint main(){ return value(); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("value:");
    expect(sccAsm).toContain("\tld\thl,#88");
    expect(sccAsm).toContain("main:");
    expect(sccAsm).toContain("\tcall\tvalue");
  });

  test("source mode supports internal constant arguments in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-call-arg-"));
    const inputFile = path.join(tempDir, "return-call-arg.c");
    fs.writeFileSync(inputFile, "int echo(int a){ return 65; }\nint main(){ return echo(66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("main:");
    expect(sccAsm).toContain("\tld\thl,#66");
    expect(sccAsm).toContain("\tpush\thl");
    expect(sccAsm).toContain("\tcall\techo");
    expect(sccAsm).toContain("\tpop\tbc");
  });

  test("source mode supports two constant arguments in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-call-2arg-"));
    const inputFile = path.join(tempDir, "return-call-2arg.c");
    fs.writeFileSync(inputFile, "int pair(int a, int b){ return 90; }\nint main(){ return pair(65, 66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\thl,#65");
    expect(sccAsm).toContain("\tld\thl,#66");
    expect((sccAsm.match(/\tpush\thl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tpop\tbc/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("source mode supports returning a single int argument in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-return-arg-"));
    const inputFile = path.join(tempDir, "return-arg.c");
    fs.writeFileSync(inputFile, "int echo(int a){ return a; }\nint main(){ return echo(66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("echo:");
    expect(sccAsm).toContain("\tld\thl,#2");
    expect(sccAsm).toContain("\tld\ta,(hl)");
    expect(sccAsm).toContain("\tcall\techo");
  });

  test("source mode supports returning a single char argument in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-return-char-arg-"));
    const inputFile = path.join(tempDir, "return-char-arg.c");
    fs.writeFileSync(inputFile, "char echo(char a){ return a; }\nint main(){ return echo(66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("echo:");
    expect(sccAsm).toContain("\tld\thl,#2");
    expect(sccAsm).toContain("\tld\tl,(hl)");
    expect(sccAsm).toContain("\tld\th,#0");
  });

  test("source mode supports returning the first of two int arguments in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-return-2arg-"));
    const inputFile = path.join(tempDir, "return-2arg.c");
    fs.writeFileSync(inputFile, "int pick(int a, int b){ return a; }\nint main(){ return pick(65, 66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("pick:");
    expect(sccAsm).toContain("\tld\thl,#4");
    expect(sccAsm).toContain("\tadd\thl,sp");
    expect(sccAsm).toContain("\tcall\tpick");
  });

  test("source mode supports equality compare expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-compare-eq-"));
    const inputFile = path.join(tempDir, "compare-eq.c");
    fs.writeFileSync(inputFile, "int eqpair(int a, int b){ return a == b; }\nint main(){ return eqpair(66, 66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.eq");
    expect(sccAsm).toContain("\tcall\teqpair");
  });

  test("source mode supports greater-than compare expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-compare-gt-"));
    const inputFile = path.join(tempDir, "compare-gt.c");
    fs.writeFileSync(inputFile, "int bigger(int a, int b){ return a > b; }\nint main(){ return bigger(66, 65); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.gt");
    expect(sccAsm).toContain("bigger:");
  });

  test("source mode supports not-equal compare expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-compare-ne-"));
    const inputFile = path.join(tempDir, "compare-ne.c");
    fs.writeFileSync(inputFile, "int noteq(int a, int b){ return a != b; }\nint main(){ return noteq(66, 65); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.ne");
    expect(sccAsm).toContain("noteq:");
  });

  test("source mode supports less-than compare expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-compare-lt-"));
    const inputFile = path.join(tempDir, "compare-lt.c");
    fs.writeFileSync(inputFile, "int smaller(int a, int b){ return a < b; }\nint main(){ return smaller(65, 66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.lt");
    expect(sccAsm).toContain("smaller:");
  });

  test("source mode supports greater-or-equal compare expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-compare-ge-"));
    const inputFile = path.join(tempDir, "compare-ge.c");
    fs.writeFileSync(inputFile, "int atleast(int a, int b){ return a >= b; }\nint main(){ return atleast(66, 66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.ge");
    expect(sccAsm).toContain("atleast:");
  });

  test("source mode supports less-or-equal compare expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-compare-le-"));
    const inputFile = path.join(tempDir, "compare-le.c");
    fs.writeFileSync(inputFile, "int atmost(int a, int b){ return a <= b; }\nint main(){ return atmost(65, 66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.le");
    expect(sccAsm).toContain("atmost:");
  });

  test("source mode supports if-return with fallthrough return in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-if-fallthrough-"));
    const inputFile = path.join(tempDir, "if-fallthrough.c");
    fs.writeFileSync(inputFile, "int flag(int a, int b){ if (a == b) return 1; return 0; }\nint main(){ return flag(66, 66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.eq");
    expect(sccAsm).toContain("\tjp\tz,.2");
    expect(sccAsm).toContain("\tld\thl,#1");
    expect(sccAsm).toContain("\tld\thl,#0");
  });

  test("source mode supports if-else return in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-if-else-"));
    const inputFile = path.join(tempDir, "if-else.c");
    fs.writeFileSync(inputFile, "int flag(int a, int b){ if (a > b) return 1; else return 0; }\nint main(){ return flag(66, 65); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.gt");
    expect(sccAsm).toContain("\tjp\tz,.2");
    expect(sccAsm).toContain("\tld\thl,#1");
    expect(sccAsm).toContain("\tld\thl,#0");
  });

  test("source mode supports brace-wrapped if-else return in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-if-brace-else-"));
    const inputFile = path.join(tempDir, "if-brace-else.c");
    fs.writeFileSync(inputFile, "int flag(int a, int b){ if (a > b) { return 1; } else { return 0; } }\nint main(){ return flag(66, 65); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.gt");
    expect(sccAsm).toContain("\tjp\tz,.2");
    expect(sccAsm).toContain("\tld\thl,#1");
    expect(sccAsm).toContain("\tld\thl,#0");
  });

  test("source mode supports brace-wrapped if-return with fallthrough return in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-if-brace-fallthrough-"));
    const inputFile = path.join(tempDir, "if-brace-fallthrough.c");
    fs.writeFileSync(inputFile, "int flag(int a, int b){ if (a == b) { return 1; } return 0; }\nint main(){ return flag(66, 66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.eq");
    expect(sccAsm).toContain("\tjp\tz,.2");
    expect(sccAsm).toContain("\tld\thl,#1");
    expect(sccAsm).toContain("\tld\thl,#0");
  });

  test("source mode supports multi-statement brace branches in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-if-branch-block-"));
    const inputFile = path.join(tempDir, "if-branch-block.c");
    fs.writeFileSync(
      inputFile,
      "int flag(int a, int b){ int x; if (a > b) { x = 1; return x; } else { x = 0; return x; } }\nint main(){ return flag(66, 65); }\n",
      "utf8",
    );
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.gt");
    expect((sccAsm.match(/\tld\t\(hl\),#1/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tld\t\(hl\),#0/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("source mode supports initialized local int variables in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-local-init-"));
    const inputFile = path.join(tempDir, "local-init.c");
    fs.writeFileSync(inputFile, "int localv(){ int x = 90; return x; }\nint main(){ return localv(); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("localv:");
    expect(sccAsm).toContain("\tdec\tsp");
    expect(sccAsm).toContain("\tld\t(hl),#90");
    expect(sccAsm).toContain("\tinc\tsp");
  });

  test("source mode supports initialized local char variables in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-local-char-init-"));
    const inputFile = path.join(tempDir, "local-char-init.c");
    fs.writeFileSync(inputFile, "char localc(){ char x = 67; return x; }\nint main(){ return localc(); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("localc:");
    expect(sccAsm).toContain("\tdec\tsp");
    expect(sccAsm).toContain("\tld\t(hl),#67");
    expect(sccAsm).toContain("\tld\tl,(hl)");
    expect(sccAsm).toContain("\tld\th,#0");
  });

  test("source mode supports local assignment before return in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-local-assign-"));
    const inputFile = path.join(tempDir, "local-assign.c");
    fs.writeFileSync(inputFile, "int localv(){ int x; x = 91; return x; }\nint main(){ return localv(); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\t(hl),#91");
    expect(sccAsm).toContain("\tld\ta,(hl)");
  });

  test("source mode supports local assignment from an argument in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-local-from-arg-"));
    const inputFile = path.join(tempDir, "local-from-arg.c");
    fs.writeFileSync(inputFile, "int localv(int a){ int x; x = a; return x; }\nint main(){ return localv(92); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tpush\thl");
    expect(sccAsm).toContain("\tpop\tde");
    expect(sccAsm).toContain("\tld\t(hl),e");
  });

  test("source mode supports local assignment from a call result in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-local-from-call-"));
    const inputFile = path.join(tempDir, "local-from-call.c");
    fs.writeFileSync(inputFile, "int value(){ return 93; }\nint localv(){ int x; x = value(); return x; }\nint main(){ return localv(); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\tvalue");
    expect(sccAsm).toContain("\tpush\thl");
    expect(sccAsm).toContain("\tld\t(hl),e");
  });

  test("source mode supports brace-wrapped while loops in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-while-"));
    const inputFile = path.join(tempDir, "while.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; while (x > 90) { x = 66; } return x; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tcall\t\.gt/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tld\t(hl),#66");
  });

  test("source mode supports single-statement while loops in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-while-single-"));
    const inputFile = path.join(tempDir, "while-single.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; while (x > 90) x = 66; return x; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tcall\t\.gt/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tld\t(hl),#66");
  });

  test("source mode supports nested single-statement if-else inside branch blocks in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-nested-if-"));
    const inputFile = path.join(tempDir, "nested-if.c");
    fs.writeFileSync(
      inputFile,
      "int flag(int a, int b, int c){ if (a > b) { if (b > c) return 1; else return 2; } return 0; }\nint main(){ return flag(70, 69, 68); }\n",
      "utf8",
    );
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tcall\t\.gt/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tld\thl,#1");
    expect(sccAsm).toContain("\tld\thl,#2");
    expect(sccAsm).toContain("\tld\thl,#0");
  });

  test("source mode supports chained else-if conditionals in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-else-if-"));
    const inputFile = path.join(tempDir, "else-if.c");
    fs.writeFileSync(
      inputFile,
      "int grade(int a, int b){ if (a > b) return 1; else if (a == b) return 2; else return 3; }\nint main(){ return grade(70, 69); }\n",
      "utf8",
    );
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.gt");
    expect(sccAsm).toContain("\tcall\t.eq");
    expect(sccAsm).toContain("\tld\thl,#1");
    expect(sccAsm).toContain("\tld\thl,#2");
    expect(sccAsm).toContain("\tld\thl,#3");
  });

  test("source mode supports local declarations inside branch blocks in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-branch-local-"));
    const inputFile = path.join(tempDir, "branch-local.c");
    fs.writeFileSync(
      inputFile,
      "int flag(int a, int b){ if (a > b) { int x = 1; return x; } else { int y = 2; return y; } }\nint main(){ return flag(70, 69); }\n",
      "utf8",
    );
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.gt");
    expect((sccAsm.match(/\tdec\tsp/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tld\t(hl),#1");
    expect(sccAsm).toContain("\tld\t(hl),#2");
  });

  test("source mode supports local declarations inside while blocks in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-while-local-"));
    const inputFile = path.join(tempDir, "while-local.c");
    fs.writeFileSync(
      inputFile,
      "int main(){ int x = 65; while (x > 90) { int y = 66; x = y; } return x; }\n",
      "utf8",
    );
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tcall\t\.gt/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tdec\tsp/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tld\t(hl),#66");
    expect(sccAsm).toContain("\tld\t(hl),e");
  });

  test("source mode supports brace-wrapped else-if bodies with local declarations in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-else-if-local-"));
    const inputFile = path.join(tempDir, "else-if-local.c");
    fs.writeFileSync(
      inputFile,
      "int grade(int a, int b){ if (a > b) { int x = 1; return x; } else if (a == b) { int y = 2; return y; } else { int z = 3; return z; } }\nint main(){ return grade(70, 69); }\n",
      "utf8",
    );
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.gt");
    expect(sccAsm).toContain("\tcall\t.eq");
    expect((sccAsm.match(/\tdec\tsp/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(sccAsm).toContain("\tld\t(hl),#1");
    expect(sccAsm).toContain("\tld\t(hl),#2");
    expect(sccAsm).toContain("\tld\t(hl),#3");
  });

  test("source mode emits data literals and call expression statements without fixture backing", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-outstr-"));
    const inputFile = path.join(tempDir, "source-outstr.c");
    fs.writeFileSync(inputFile, "int main(){ outstr(\" HELLO, CP/M$\"); return 0; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\toutstr");
    expect(sccAsm).toContain("\t.area\t_DATA");
    expect(sccAsm).toContain(".ascii\t\" HELLO, CP/M$\"");
  });

  test("source mode supports multi-call expression statements for cpm-hello-like source", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-cpmhello-"));
    const inputFile = path.join(tempDir, "source-cpmhello.c");
    fs.writeFileSync(
      inputFile,
      "int main(){ fputc(35, 1); outstr(\" HELLO, CP/M$\"); return 0; }\n",
      "utf8",
    );
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\tfputc");
    expect(sccAsm).toContain("\tcall\toutstr");
    expect((sccAsm.match(/\tpush\thl/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(sccAsm).toContain(".ascii\t\" HELLO, CP/M$\"");
  });

  test("source mode rejects duplicate function names in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-dup-fn-"));
    const inputFile = path.join(tempDir, "dup-fn.c");
    fs.writeFileSync(inputFile, "int same(){ return 1; }\nint same(){ return 2; }\n", "utf8");

    expect(() => adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    })).toThrow(/does not support duplicate function 'same\(\)'/);
  });

  test("source mode rejects duplicate parameter names in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-dup-param-"));
    const inputFile = path.join(tempDir, "dup-param.c");
    fs.writeFileSync(inputFile, "int same(int a, int a){ return a; }\n", "utf8");

    expect(() => adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    })).toThrow(/does not support duplicate parameter 'a' in same\(\)/);
  });

  test("source mode rejects duplicate local names in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-dup-local-"));
    const inputFile = path.join(tempDir, "dup-local.c");
    fs.writeFileSync(inputFile, "int same(){ int x = 1; int x = 2; return x; }\n", "utf8");

    expect(() => adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    })).toThrow(/does not support duplicate local 'x' in same\(\)/);
  });

  test("source mode rejects local names that shadow parameters in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-shadow-param-"));
    const inputFile = path.join(tempDir, "shadow-param.c");
    fs.writeFileSync(inputFile, "int same(int a){ int a = 2; return a; }\n", "utf8");

    expect(() => adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    })).toThrow(/does not support local 'a' shadowing a parameter in same\(\)/);
  });

  test("source mode can link with CP/M runtime and execute a helper-backed .COM image", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-cpm-run-"));
    const inputFile = path.join(tempDir, "source-cpm-run.c");
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const outPath = path.join(tempDir, "source-cpm-run.com");

    fs.writeFileSync(inputFile, "int main(){ return emitx(); }\n", "utf8");
    const programRel = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    }).relFile;

    const helperRel = assembleEmitCharRuntime(tempDir, "emitx", 88);

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, programRel, helperRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("X");
  });

  test("source mode can link with compare helpers and execute a less-than-driven .COM image", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-cpm-compare-run-"));
    const inputFile = path.join(tempDir, "source-cpm-compare-run.c");
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    const outPath = path.join(tempDir, "source-cpm-compare-run.com");

    fs.writeFileSync(
      inputFile,
      "int outchar(int c); int main(){ if (65 < 66) return emitx(); return 0; }\n",
      "utf8",
    );
    const programRel = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    }).relFile;

    const helperRel = assembleEmitCharRuntime(tempDir, "emitx", 76);
    const compareRel = assembleCompareHelperRuntime(tempDir);

    fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
    expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);

    link([runtimeRelPath, programRel, helperRel, compareRel], outPath, { com: true, orgText: "100H" });

    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(2000);

    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("L");
  });

  test("source mode still rejects unsupported statements outside the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-unsupported-"));
    const inputFile = path.join(tempDir, "unsupported.c");
    fs.writeFileSync(inputFile, "int main(){ for (;;) return 1; }\n", "utf8");

    expect(() => adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    })).toThrow(/does not support statement 'for \(\;\;\) return 1'/);
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

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

function assembleArithmeticHelperRuntime(tempDir: string): string {
  const helperAsmPath = path.join(tempDir, "arith-helpers.asm");
  const helperRelPath = path.join(tempDir, "arith-helpers.rel");
  const helperSource = [
    "\t.globl\t.asr",
    "\t.globl\t.asl",
    "\t.globl\t.mul",
    "\t.globl\t.div",
    "\t.module\tarith_helpers",
    "\t.area\t_CODE",
    ".asr:",
    "\tex\tde,hl",
    "arith_asr1:",
    "\tdec\te",
    "\tret\tm",
    "\tld\ta,h",
    "\trla",
    "\tld\ta,h",
    "\trra",
    "\tld\th,a",
    "\tld\ta,l",
    "\trra",
    "\tld\tl,a",
    "\tjr\tarith_asr1",
    ".asl:",
    "\tex\tde,hl",
    "arith_asl1:",
    "\tdec\te",
    "\tret\tm",
    "\tadd\thl,hl",
    "\tjr\tarith_asl1",
    ".mul:",
    "\tld\tb,h",
    "\tld\tc,l",
    "\tld\thl,#0",
    "arith_mul1:",
    "\tld\ta,c",
    "\trrca",
    "\tjr\tnc,arith_mul2",
    "\tadd\thl,de",
    "arith_mul2:",
    "\txor\ta",
    "\tld\ta,b",
    "\trra",
    "\tld\tb,a",
    "\tld\ta,c",
    "\trra",
    "\tld\tc,a",
    "\tor\tb",
    "\tret\tz",
    "\txor\ta",
    "\tld\ta,e",
    "\trla",
    "\tld\te,a",
    "\tld\ta,d",
    "\trla",
    "\tld\td,a",
    "\tor\te",
    "\tret\tz",
    "\tjr\tarith_mul1",
    ".div:",
    "\tld\tb,h",
    "\tld\tc,l",
    "\tld\ta,d",
    "\txor\tb",
    "\tpush\taf",
    "\tld\ta,d",
    "\tor\ta",
    "\tcall\tm,arith_deneg",
    "\tld\ta,b",
    "\tor\ta",
    "\tcall\tm,arith_bcneg",
    "\tld\ta,#16",
    "\tpush\taf",
    "\tex\tde,hl",
    "\tld\tde,#0",
    "arith_div1:",
    "\tadd\thl,hl",
    "\tcall\tarith_rdel",
    "\tjr\tz,arith_div2",
    "\tcall\tarith_cmpbd",
    "\tjp\tm,arith_div2",
    "\tld\ta,l",
    "\tor\t#1",
    "\tld\tl,a",
    "\tld\ta,e",
    "\tsub\tc",
    "\tld\te,a",
    "\tld\ta,d",
    "\tsbc\ta,b",
    "\tld\td,a",
    "arith_div2:",
    "\tpop\taf",
    "\tdec\ta",
    "\tjr\tz,arith_div3",
    "\tpush\taf",
    "\tjr\tarith_div1",
    "arith_div3:",
    "\tpop\taf",
    "\tret\tp",
    "\tcall\tarith_deneg",
    "\tex\tde,hl",
    "\tcall\tarith_deneg",
    "\tex\tde,hl",
    "\tret",
    "arith_deneg:",
    "\tld\ta,d",
    "\tcpl",
    "\tld\td,a",
    "\tld\ta,e",
    "\tcpl",
    "\tld\te,a",
    "\tinc\tde",
    "\tret",
    "arith_bcneg:",
    "\tld\ta,b",
    "\tcpl",
    "\tld\tb,a",
    "\tld\ta,c",
    "\tcpl",
    "\tld\tc,a",
    "\tinc\tbc",
    "\tret",
    "arith_rdel:",
    "\tld\ta,e",
    "\trla",
    "\tld\te,a",
    "\tld\ta,d",
    "\trla",
    "\tld\td,a",
    "\tor\te",
    "\tret",
    "arith_cmpbd:",
    "\tld\ta,e",
    "\tsub\tc",
    "\tld\ta,d",
    "\tsbc\ta,b",
    "\tret",
    "",
  ].join("\n");
  fs.writeFileSync(helperAsmPath, translateSccAsm(helperSource, { moduleName: "arith_helpers" }), "utf8");
  expect(assemble(createLogger("quiet"), helperAsmPath, helperRelPath, { relVersion: 2 }).errors).toEqual([]);
  return helperRelPath;
}

function assembleMulShiftHelperRuntime(tempDir: string): string {
  const helperAsmPath = path.join(tempDir, "mul-shift-helpers.asm");
  const helperRelPath = path.join(tempDir, "mul-shift-helpers.rel");
  const helperSource = [
    "\t.globl\t.asr",
    "\t.globl\t.asl",
    "\t.globl\t.mul",
    "\t.module\tmul_shift_helpers",
    "\t.area\t_CODE",
    ".asr:",
    "\tex\tde,hl",
    "mulshift_asr1:",
    "\tdec\te",
    "\tret\tm",
    "\tld\ta,h",
    "\trla",
    "\tld\ta,h",
    "\trra",
    "\tld\th,a",
    "\tld\ta,l",
    "\trra",
    "\tld\tl,a",
    "\tjr\tmulshift_asr1",
    ".asl:",
    "\tex\tde,hl",
    "mulshift_asl1:",
    "\tdec\te",
    "\tret\tm",
    "\tadd\thl,hl",
    "\tjr\tmulshift_asl1",
    ".mul:",
    "\tld\tb,h",
    "\tld\tc,l",
    "\tld\thl,#0",
    "mulshift_mul1:",
    "\tld\ta,c",
    "\trrca",
    "\tjr\tnc,mulshift_mul2",
    "\tadd\thl,de",
    "mulshift_mul2:",
    "\txor\ta",
    "\tld\ta,b",
    "\trra",
    "\tld\tb,a",
    "\tld\ta,c",
    "\trra",
    "\tld\tc,a",
    "\tor\tb",
    "\tret\tz",
    "\txor\ta",
    "\tld\ta,e",
    "\trla",
    "\tld\te,a",
    "\tld\ta,d",
    "\trla",
    "\tld\td,a",
    "\tor\te",
    "\tret\tz",
    "\tjr\tmulshift_mul1",
    "",
  ].join("\n");
  fs.writeFileSync(helperAsmPath, translateSccAsm(helperSource, { moduleName: "mul_shift_helpers" }), "utf8");
  expect(assemble(createLogger("quiet"), helperAsmPath, helperRelPath, { relVersion: 2 }).errors).toEqual([]);
  return helperRelPath;
}

function assembleCpmRuntime(tempDir: string): string {
  const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
  const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
  fs.writeFileSync(runtimeAsmPath, translateSccAsm(getBundledSccRuntime("cpmcrt"), { moduleName: "cpmcrt" }), "utf8");
  expect(assemble(createLogger("quiet"), runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);
  return runtimeRelPath;
}

function compileSourceRel(tempDir: string, fileName: string, sourceText: string): string {
  const inputFile = path.join(tempDir, fileName);
  fs.writeFileSync(inputFile, sourceText, "utf8");
  return new TsSccCompilerAdapter().compileToRel(createLogger("quiet"), {
    inputFile,
    tempDir,
  }).relFile;
}

function linkAndRunCom(
  tempDir: string,
  stem: string,
  programRel: string,
  extraRelPaths: string[] = [],
  maxCycles = 2000,
): string {
  const runtimeRelPath = assembleCpmRuntime(tempDir);
  const outPath = path.join(tempDir, `${stem}.com`);
  link([runtimeRelPath, ...extraRelPaths, programRel], outPath, { com: true, orgText: "100H" });

  const core = new Z80DebugCore(false);
  core.setCpm22Enabled(true);
  core.setAllowOutOfImage(true);
  core.loadImage(fs.readFileSync(outPath), 0x0100);
  core.setEntry(0x0100);
  const result = core.run(maxCycles);

  expect(result.reason).toBe("BDOS 0: terminate");
  return core.getOutput();
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

  test("source mode supports additive return expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-additive-"));
    const inputFile = path.join(tempDir, "additive.c");
    fs.writeFileSync(inputFile, "int sum(int a, int b){ return a + b; }\nint diff(int a, int b){ return a - b; }\nint main(){ return sum(32, 33) + diff(70, 5); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tadd\thl,de");
    expect(sccAsm).toContain("\tor\ta");
    expect(sccAsm).toContain("\tsbc\thl,de");
  });

  test("source mode supports unary minus expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-unary-minus-"));
    const inputFile = path.join(tempDir, "unary-minus.c");
    fs.writeFileSync(inputFile, "int neg(int a){ return -a; }\nint main(){ return neg(-1) + 67; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tsbc\thl,de");
    expect(sccAsm).toContain("\tld\thl,#0");
  });

  test("source mode supports logical-not expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-logical-not-"));
    const inputFile = path.join(tempDir, "logical-not.c");
    fs.writeFileSync(inputFile, "int flip(int a){ return !a; }\nint main(){ return flip(0) + flip(1); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.eq");
    expect(sccAsm).toContain("\tld\thl,#0");
  });

  test("source mode supports logical and/or expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-logical-"));
    const inputFile = path.join(tempDir, "logical.c");
    fs.writeFileSync(inputFile, "int pair(int a, int b){ return a && b; }\nint any(int a, int b){ return a || b; }\nint main(){ return pair(1, 2) + any(0, 1); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tjp\tz,.200");
    expect(sccAsm).toContain("\tjp\tnz,.200");
    expect(sccAsm).toContain("\tld\thl,#1");
  });

  test("source mode supports ternary conditional expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-conditional-"));
    const inputFile = path.join(tempDir, "conditional.c");
    fs.writeFileSync(inputFile, "int pick(int a, int b, int c){ return a ? b : c; }\nint main(){ return pick(0, 65, 66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toMatch(/\tjp\tz,\.\d+/);
    expect(sccAsm).toMatch(/\tjp\t\.\d+/);
  });

  test("source mode supports pointer-valued ternary conditional expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-conditional-"));
    const inputFile = path.join(tempDir, "pointer-conditional.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int c = 1; int *p = &x; int *q = &y; return *(c ? p : q) + *(c ? p : 0); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\ta,h/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tor\tl/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("source mode supports pointer-valued conditional assignment and compare expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-conditional-assign-"));
    const inputFile = path.join(tempDir, "pointer-conditional-assign.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int c = 1; int *p = &x; int *q = &y; p = c ? p : q; return (p != 0) + ((c ? p : q) == p); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(sccAsm).toContain("\tcall\t.eq");
    expect(sccAsm).toContain("\tcall\t.ne");
  });

  test("source mode supports sizeof expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-sizeof-"));
    const inputFile = path.join(tempDir, "sizeof.c");
    fs.writeFileSync(inputFile, "int main(int a){ char buf[4]; return sizeof(char) + sizeof buf + sizeof a + 58; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\thl,#1");
    expect(sccAsm).toContain("\tld\thl,#4");
    expect(sccAsm).toContain("\tld\thl,#2");
  });

  test("source mode supports local assignment expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-assign-expr-"));
    const inputFile = path.join(tempDir, "assign-expr.c");
    fs.writeFileSync(inputFile, "int main(){ int x; return x = 66; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tex\tde,hl");
    expect(sccAsm).toContain("\tld\t(hl),d");
  });

  test("source mode supports char array assignment expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-array-assign-expr-"));
    const inputFile = path.join(tempDir, "array-assign-expr.c");
    fs.writeFileSync(inputFile, "int main(){ int i = 1; char buf[4]; return buf[i] = 65; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\t(hl),e");
    expect(sccAsm).toContain("\tld\tl,e");
  });

  test("source mode supports prefix and postfix increment/decrement expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-incdec-expr-"));
    const inputFile = path.join(tempDir, "incdec-expr.c");
    fs.writeFileSync(inputFile, "int main(){ int i = 1; char buf[4]; buf[1] = 65; return ++i + buf[i]--; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tinc\tde");
    expect(sccAsm).toContain("\tdec\te");
  });

  test("source mode supports compound assignment expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-compound-assign-expr-"));
    const inputFile = path.join(tempDir, "compound-assign-expr.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 1; char buf[4]; return x += 2 + (buf[0] |= 3); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tor\td");
    expect(sccAsm).toContain("\tld\t(hl),d");
  });

  test("source mode supports comma expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-comma-"));
    const inputFile = path.join(tempDir, "comma.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 0; return x = 1, x += 2, x + 62; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tadd\thl,de");
  });

  test("source mode supports pointer locals and dereference in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-"));
    const inputFile = path.join(tempDir, "pointer.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 66; int *p = &x; char buf[2]; char *q = buf; *q = 65; return *p; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\ta,(hl)");
    expect(sccAsm).toContain("\tld\t(hl),e");
    expect(sccAsm).toContain("\tld\t(hl),d");
  });

  test("source mode supports address-of array elements and pointer indexing in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-index-"));
    const inputFile = path.join(tempDir, "pointer-index.c");
    fs.writeFileSync(inputFile, "int main(){ int i = 1; char buf[3]; buf[1] = 65; char *p = &buf[i]; return p[0]; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tld\tl,(hl)");
  });

  test("source mode supports address-of dereference cancellation and pointer-index element address in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-address-cancel-"));
    const inputFile = path.join(tempDir, "pointer-address-cancel.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int i = 1; int *p = &x; return (&*p == p) + *(&p[i]); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.eq");
    expect((sccAsm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(sccAsm).toContain("\tld\ta,(hl)");
  });

  test("source mode supports pointer indexing writes and pointer arithmetic dereference in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-arith-"));
    const inputFile = path.join(tempDir, "pointer-arith.c");
    fs.writeFileSync(inputFile, "int main(){ char buf[3]; char *p = buf; p[1] = 66; return *(p + 1); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tld\t(hl),e");
    expect(sccAsm).toContain("\tld\tl,(hl)");
  });

  test("source mode supports int pointer indexing and scaled pointer arithmetic in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-int-pointer-"));
    const inputFile = path.join(tempDir, "int-pointer.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int *p = &x; return p[1] + *(p + 1); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tld\ta,(hl)");
  });

  test("source mode supports backward int pointer arithmetic in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-int-pointer-backward-"));
    const inputFile = path.join(tempDir, "int-pointer-backward.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int *p = &y; return *(p - 1); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tsbc\thl,de");
    expect(sccAsm).toContain("\tadd\thl,hl");
    expect(sccAsm).toContain("\tld\ta,(hl)");
  });

  test("source mode supports pointer compound assignment in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-compound-"));
    const inputFile = path.join(tempDir, "pointer-compound.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int *p = &x; p += 1; return *p; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tadd\thl,hl");
    expect(sccAsm).toContain("\tld\t(hl),e");
    expect(sccAsm).toContain("\tld\t(hl),d");
    expect(sccAsm).toContain("\tld\ta,(hl)");
  });

  test("source mode supports pointer prefix and postfix increment expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-incdec-"));
    const inputFile = path.join(tempDir, "pointer-incdec.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int *p = &x; return *(++p) + *(p++); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tinc\tde/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("source mode supports pointer-indexed prefix and postfix increment/decrement expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-index-incdec-"));
    const inputFile = path.join(tempDir, "pointer-index-incdec-expr.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 1; int y = 2; int i = 1; int *p = &x; return ++p[i] + p[i]--; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tpush\tde");
    expect(sccAsm).toContain("\tpop\thl");
  });

  test("source mode supports pointer prefix and postfix decrement expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-decdec-"));
    const inputFile = path.join(tempDir, "pointer-decdec.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int *p = &y; return *(--p) + *(p--); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tdec\tde/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("source mode supports pointer subtract compound assignment in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-compound-sub-"));
    const inputFile = path.join(tempDir, "pointer-compound-sub.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int *p = &y; p -= 1; return *p; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tsbc\thl,de");
    expect(sccAsm).toContain("\tadd\thl,hl");
    expect(sccAsm).toContain("\tld\t(hl),d");
    expect(sccAsm).toContain("\tld\ta,(hl)");
  });

  test("source mode supports dynamic int pointer indexing and arithmetic in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-int-pointer-dynamic-"));
    const inputFile = path.join(tempDir, "int-pointer-dynamic.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int z = 67; int i = 1; int *p = &x; return p[i] + *(p + i); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("source mode supports dynamic int pointer indexed writes in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-int-pointer-dynamic-write-"));
    const inputFile = path.join(tempDir, "int-pointer-dynamic-write.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int z = 67; int i = 1; int *p = &x; p[i] = z; return *(p + i); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("source mode supports pointer-indexed assignment and compound assignment expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-index-assign-expr-"));
    const inputFile = path.join(tempDir, "pointer-index-assign-expr.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int z = 67; int i = 1; int *p = &x; return (p[i] = z) + (p[i] |= 3); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tor\td");
  });

  test("source mode supports pointer equality and inequality compares in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-compare-"));
    const inputFile = path.join(tempDir, "pointer-compare.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int *p = &x; int *q = &x; return (p == q) + (p != q); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.eq");
    expect(sccAsm).toContain("\tcall\t.ne");
  });

  test("source mode supports pointer and integer equality/inequality compares in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-int-compare-"));
    const inputFile = path.join(tempDir, "pointer-int-compare.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int *p = &x; return (p == 0) + (0 == p) + (p != 0) + (0 != p); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tcall\t\.eq/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tcall\t\.ne/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("source mode supports pointer relational compares in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-rel-compare-"));
    const inputFile = path.join(tempDir, "pointer-rel-compare.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int y = 66; int *p = &x; int *q = &y; return (p < q) + (p <= q) + (q > p) + (q >= p); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.lt");
    expect(sccAsm).toContain("\tcall\t.le");
    expect(sccAsm).toContain("\tcall\t.gt");
    expect(sccAsm).toContain("\tcall\t.ge");
  });

  test("source mode supports pointer truthiness conditions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-truthy-"));
    const inputFile = path.join(tempDir, "pointer-truthy.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 65; int *p = &x; if (p) return 1; if (!p) return 2; return 3; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\ta,h");
    expect((sccAsm.match(/\tor\tl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("source mode supports dereference truthiness in if/while/for conditions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-deref-truthy-"));
    const inputFile = path.join(tempDir, "deref-truthy.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 2; int *p = &x; if (*p) while (*p) { (*p)--; } for (; *p; ++p) { break; } return x; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tor\tl/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(sccAsm).toContain("\tadd\thl,hl");
    expect(sccAsm).toContain("\tadd\thl,de");
  });

  test("source mode supports int pointer parameters and calls in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-param-"));
    const inputFile = path.join(tempDir, "pointer-param.c");
    fs.writeFileSync(inputFile, "int second(int *p){ return p[1]; }\nint main(){ int x = 65; int y = 66; return second(&x); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\tsecond");
    expect(sccAsm).toContain("\tpush\thl");
    expect((sccAsm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(sccAsm).toContain("\tld\ta,(hl)");
  });

  test("source mode supports opaque struct and union pointer params in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-pointer-"));
    const inputFile = path.join(tempDir, "aggregate-pointer.c");
    fs.writeFileSync(inputFile, "int check(struct Foo *p, union Bar *q){ if (p) return q != 0; return p == 0; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\ta,h");
    expect(sccAsm).toContain("\tcall\t.ne");
    expect(sccAsm).toContain("\tcall\t.eq");
  });

  test("source mode supports aggregate pointer-pointer declarations in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-pointer-pointer-"));
    const inputFile = path.join(tempDir, "aggregate-pointer-pointer.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ struct Foo x; union Bar y; struct Foo *p = &x; union Bar *q = &y; struct Foo **pp = &p; union Bar **qq = &q; if (pp) return (pp != 0) + (qq != 0); return 0; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tcall\t.ne/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tadd\thl,sp/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test("source mode supports aggregate-pointer-valued conditional expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-pointer-conditional-"));
    const inputFile = path.join(tempDir, "aggregate-pointer-conditional.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return (c ? p : q) == p; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tcall\t.eq");
    expect(sccAsm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("source mode supports pointer-member access on conditional pointer expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-pointer-member-conditional-"));
    const inputFile = path.join(tempDir, "aggregate-pointer-member-conditional.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return (c ? p : q)->a + (c ? p : q)->b; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(sccAsm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("source mode supports address-of on pointer-member access from conditional pointer expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-pointer-member-conditional-address-"));
    const inputFile = path.join(tempDir, "aggregate-pointer-member-conditional-address.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return first(&(c ? p : q)->a) + second(&(c ? p : q)->b); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\tfirst");
    expect(sccAsm).toContain("\tcall\tsecond");
    expect((sccAsm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("source mode supports sizeof aggregate types in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-sizeof-"));
    const inputFile = path.join(tempDir, "aggregate-sizeof.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ return sizeof(struct Foo) + sizeof(union Bar); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\thl,#3");
    expect(sccAsm).toContain("\tld\thl,#2");
  });

  test("source mode supports local aggregate objects for sizeof locals and address-of calls in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-local-"));
    const inputFile = path.join(tempDir, "aggregate-local.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint take(struct Foo *p){ return p != 0; }\nint main(){ struct Foo x; return sizeof x + take(&x); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\thl,#3");
    expect(sccAsm).toContain("\tadd\thl,sp");
    expect(sccAsm).toContain("\tcall\ttake");
  });

  test("source mode supports local aggregate pointers initialized from aggregate object addresses in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-local-pointer-"));
    const inputFile = path.join(tempDir, "aggregate-local-pointer.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint take(struct Foo *p){ return p != 0; }\nint main(){ struct Foo x; struct Foo *p = &x; return take(p) + (p != 0); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\ttake");
    expect(sccAsm).toContain("\tcall\t.ne");
    expect(sccAsm).toContain("\tadd\thl,sp");
  });

  test("source mode supports local union pointers initialized from union object addresses in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-union-local-pointer-"));
    const inputFile = path.join(tempDir, "union-local-pointer.c");
    fs.writeFileSync(inputFile, "union Bar { char a; int b; };\nint take(union Bar *p){ return p != 0; }\nint main(){ union Bar x; union Bar *p = &x; return take(p) + (p != 0); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\ttake");
    expect(sccAsm).toContain("\tcall\t.ne");
    expect(sccAsm).toContain("\tadd\thl,sp");
  });

  test("source mode supports aggregate pointer assignment after declaration in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-pointer-assign-"));
    const inputFile = path.join(tempDir, "aggregate-pointer-assign.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint take(struct Foo *p){ return p != 0; }\nint main(){ struct Foo x; struct Foo *p; p = &x; return take(p) + (p != 0); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\ttake");
    expect(sccAsm).toContain("\tcall\t.ne");
    expect(sccAsm).toContain("\tadd\thl,sp");
  });

  test("source mode supports union pointer assignment after declaration in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-union-pointer-assign-"));
    const inputFile = path.join(tempDir, "union-pointer-assign.c");
    fs.writeFileSync(inputFile, "union Bar { char a; int b; };\nint take(union Bar *p){ return p != 0; }\nint main(){ union Bar x; union Bar *p; p = &x; return take(p) + (p != 0); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\ttake");
    expect(sccAsm).toContain("\tcall\t.ne");
    expect(sccAsm).toContain("\tadd\thl,sp");
  });

  test("source mode supports aggregate pointer null assignment and reassignment in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-pointer-null-"));
    const inputFile = path.join(tempDir, "aggregate-pointer-null.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint main(){ struct Foo x; struct Foo *p; p = 0; p = &x; if (p) return p != 0; return 0; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\thl,#0");
    expect(sccAsm).toContain("\tadd\thl,sp");
    expect(sccAsm).toContain("\tcall\t.ne");
  });

  test("source mode supports union pointer null assignment and reassignment in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-union-pointer-null-"));
    const inputFile = path.join(tempDir, "union-pointer-null.c");
    fs.writeFileSync(inputFile, "union Bar { char a; int b; };\nint main(){ union Bar x; union Bar *p; p = 0; p = &x; if (p) return p != 0; return 0; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\thl,#0");
    expect(sccAsm).toContain("\tadd\thl,sp");
    expect(sccAsm).toContain("\tcall\t.ne");
  });

  test("source mode supports direct aggregate address compares and truthiness in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-address-direct-"));
    const inputFile = path.join(tempDir, "aggregate-address-direct.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint main(){ struct Foo x; if (&x) return &x != 0; return 0; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tadd\thl,sp");
    expect(sccAsm).toContain("\tcall\t.ne");
  });

  test("source mode supports direct union address compares and truthiness in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-union-address-direct-"));
    const inputFile = path.join(tempDir, "union-address-direct.c");
    fs.writeFileSync(inputFile, "union Bar { char a; int b; };\nint main(){ union Bar x; if (&x) return &x != 0; return 0; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tadd\thl,sp");
    expect(sccAsm).toContain("\tcall\t.ne");
  });

  test("source mode supports mixed aggregate sizeof and direct address compare expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-mixed-expr-"));
    const inputFile = path.join(tempDir, "aggregate-mixed-expr.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint main(){ struct Foo x; return sizeof x + (&x != 0); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\thl,#3");
    expect(sccAsm).toContain("\tadd\thl,sp");
    expect(sccAsm).toContain("\tcall\t.ne");
  });

  test("source mode supports mixed union sizeof and direct address conditional expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-union-mixed-expr-"));
    const inputFile = path.join(tempDir, "union-mixed-expr.c");
    fs.writeFileSync(inputFile, "union Bar { char a; int b; };\nint main(){ union Bar x; return sizeof x + (&x ? 1 : 0); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\thl,#2");
    expect(sccAsm).toContain("\tadd\thl,sp");
    expect(sccAsm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("source mode supports local struct and union member reads in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-member-read-"));
    const inputFile = path.join(tempDir, "aggregate-member-read.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ struct Foo x; union Bar u; return x.a + x.b + u.a + u.b; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tadd\thl,sp/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(sccAsm).toContain("\tld\tl,(hl)");
    expect(sccAsm).toContain("\tld\th,(hl)");
  });

  test("source mode supports local struct and union member writes in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-member-write-"));
    const inputFile = path.join(tempDir, "aggregate-member-write.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ struct Foo x; union Bar u; x.a = 1; x.b = 2; u.a = 3; u.b = 4; return x.a + x.b + u.a + u.b; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\t(hl),e");
    expect(sccAsm).toContain("\tinc\thl");
    expect((sccAsm.match(/\tadd\thl,sp/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  test("source mode supports local aggregate assignment statements in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-assign-"));
    const inputFile = path.join(tempDir, "aggregate-assign-value.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ struct Foo x; struct Foo y; union Bar u; union Bar v; x = y; u = v; return 0; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((sccAsm.match(/\tadd\thl,sp/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  test("source mode supports aggregate pointer member reads and writes in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-pointer-member-"));
    const inputFile = path.join(tempDir, "aggregate-pointer-member.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(struct Foo *p, union Bar *q){ p->a = 1; p->b = 2; q->a = 3; q->b = 4; return p->a + p->b + q->a + q->b; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tinc\thl/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test("source mode supports address-of on aggregate fields in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-field-address-"));
    const inputFile = path.join(tempDir, "aggregate-field-address.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(struct Foo *p){ struct Foo x; return first(&x.a) + second(&x.b) + first(&p->a) + second(&p->b); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tcall\tfirst/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tcall\tsecond/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tadd\thl,sp/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("source mode supports dereferenced aggregate member reads and address-of in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-deref-member-read-"));
    const inputFile = path.join(tempDir, "aggregate-deref-member-read.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(struct Foo *p){ return (*p).a + (*p).b + first(&(*p).a) + second(&(*p).b); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tcall\tfirst/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tcall\tsecond/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("source mode supports aggregate field compound assignments and incdec statements in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-field-ops-"));
    const inputFile = path.join(tempDir, "aggregate-field-ops.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(struct Foo *p, union Bar *q){ struct Foo x; union Bar u; x.a += 1; x.b -= 2; ++u.a; u.b--; p->a += 3; p->b -= 4; ++q->a; q->b--; return x.a + x.b + u.a + u.b + p->a + p->b + q->a + q->b; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test("source mode supports aggregate field assignment expressions and incdec expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-field-expr-ops-"));
    const inputFile = path.join(tempDir, "aggregate-field-expr-ops.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint main(struct Foo *p){ struct Foo x; return (x.a += 3) + (++x.b) + (p->a = 4) + (p->b--); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tpush\tde");
    expect(sccAsm).toContain("\tpop\thl");
  });

  test("source mode supports pointer-member writes on conditional pointer expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-pointer-member-conditional-write-"));
    const inputFile = path.join(tempDir, "aggregate-pointer-member-conditional-write.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; (c ? p : q)->a = 1; (c ? p : q)->b += 2; return x.a + x.b + y.a + y.b; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tjp\t\.\d+/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("source mode supports pointer-member incdec on conditional pointer expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-pointer-member-conditional-incdec-"));
    const inputFile = path.join(tempDir, "aggregate-pointer-member-conditional-incdec.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; ++(c ? p : q)->a; (c ? p : q)->b--; return x.a + x.b + y.a + y.b; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("source mode supports pointer-member assignment and incdec expressions on conditional pointer expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-pointer-member-conditional-expr-ops-"));
    const inputFile = path.join(tempDir, "aggregate-pointer-member-conditional-expr-ops.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return ((c ? p : q)->a = 4) + (++(c ? p : q)->b) + ((c ? p : q)->a--); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(sccAsm).toContain("\tpush\tde");
    expect(sccAsm).toContain("\tpop\thl");
  });

  test("source mode supports dereferenced aggregate member assignment and incdec expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-deref-member-expr-ops-"));
    const inputFile = path.join(tempDir, "aggregate-deref-member-expr-ops.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint main(struct Foo *p){ return ((*p).a = 4) + (++(*p).b) + ((*p).a--); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(sccAsm).toContain("\tpush\tde");
  });

  test("source mode supports dereferenced conditional aggregate pointer member operations in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-deref-conditional-member-ops-"));
    const inputFile = path.join(tempDir, "aggregate-deref-conditional-member-ops.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return (*(c ? p : q)).a + first(&(*(c ? p : q)).a) + ((*(c ? p : q)).b = 3) + ((*(c ? p : q)).a--); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tjp\t\.\d+/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(sccAsm).toContain("\tcall\tfirst");
  });

  test("source mode supports dereferenced conditional aggregate pointer member statements in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-deref-conditional-member-stmt-"));
    const inputFile = path.join(tempDir, "aggregate-deref-conditional-member-stmt.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; (*(c ? p : q)).a = 1; (*(c ? p : q)).b += 2; ++(*(c ? p : q)).a; (*(c ? p : q)).b--; return x.a + x.b + y.a + y.b; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tjp\t\.\d+/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("source mode supports dereference compound assignment and incdec expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-pointer-deref-ops-"));
    const inputFile = path.join(tempDir, "pointer-deref-ops.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 1; int *p = &x; return (*p += 2) + (++*p) + ((*p)--); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(sccAsm).toContain("\tpush\tde");
    expect(sccAsm).toContain("\tpop\thl");
  });

  test("source mode supports bitwise expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-bitwise-"));
    const inputFile = path.join(tempDir, "bitwise.c");
    fs.writeFileSync(inputFile, "int mix(int a, int b){ return (a & b) ^ (a | b); }\nint main(){ return mix(65, 3); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tand\td");
    expect(sccAsm).toContain("\txor\td");
    expect(sccAsm).toContain("\tor\td");
  });

  test("source mode supports bitwise-not expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-bitnot-"));
    const inputFile = path.join(tempDir, "bitnot.c");
    fs.writeFileSync(inputFile, "int inv(int a){ return ~a; }\nint main(){ return inv(65280); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\thl,#65535");
    expect(sccAsm).toContain("\txor\td");
  });

  test("source mode supports multiplicative and shift expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-helper-ops-"));
    const inputFile = path.join(tempDir, "helper-ops.c");
    fs.writeFileSync(inputFile, "int ops(int a, int b, int c){ return (a * b) + (a / b) + (a % b) + (c << 1) + (c >> 1); }\nint main(){ return ops(6, 3, 8); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.mul");
    expect((sccAsm.match(/\tcall\t\.div/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(sccAsm).toContain("\tcall\t.asl");
    expect(sccAsm).toContain("\tcall\t.asr");
  });

  test("source mode supports local char arrays and constant index expressions in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-array-"));
    const inputFile = path.join(tempDir, "array.c");
    fs.writeFileSync(inputFile, "int main(){ char buf[16]; gets(buf); return buf[2]; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tdec\tsp");
    expect(sccAsm).toContain("\tcall\tgets");
    expect(sccAsm).toContain("\tld\thl,#2");
    expect(sccAsm).toContain("\tld\tl,(hl)");
  });

  test("source mode supports char array string literal initializers in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-array-string-init-"));
    const inputFile = path.join(tempDir, "array-string-init.c");
    fs.writeFileSync(inputFile, "int main(){ char buf[] = \"AB\"; return buf[1]; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\t(hl),#65");
    expect(sccAsm).toContain("\tld\t(hl),#66");
    expect(sccAsm).toContain("\tld\t(hl),#0");
    expect(sccAsm).toContain("\tld\thl,#1");
  });

  test("source mode supports exact-fit char array string literal initializers in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-array-string-init-exact-fit-"));
    const inputFile = path.join(tempDir, "array-string-init-exact-fit.c");
    fs.writeFileSync(inputFile, "int main(){ char buf[2] = \"AB\"; return buf[1]; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\t(hl),#65");
    expect(sccAsm).toContain("\tld\t(hl),#66");
    expect(sccAsm).not.toContain("\tld\t(hl),#0");
  });

  test("source mode supports unsized char array parameters in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-param-array-"));
    const inputFile = path.join(tempDir, "param-array.c");
    fs.writeFileSync(inputFile, "int emit(char s[]){ outstr(s); return 0; }\nint main(){ char buf[4]; buf[0] = 65; buf[1] = 36; emit(buf); return 0; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\toutstr");
  });

  test("source mode supports reading from unsized char array parameters in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-param-array-read-"));
    const inputFile = path.join(tempDir, "param-array-read.c");
    fs.writeFileSync(inputFile, "char first(char s[]){ return s[0]; }\nint main(){ char buf[3]; buf[0] = 65; buf[1] = 36; return first(buf); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\ta,(hl)");
    expect(sccAsm).toContain("\tadd\thl,de");
  });

  test("source mode supports writing to unsized char array parameters in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-param-array-write-"));
    const inputFile = path.join(tempDir, "param-array-write.c");
    fs.writeFileSync(inputFile, "int setfirst(char s[]){ s[0] = 66; return 0; }\nint main(){ char buf[3]; buf[0] = 65; buf[1] = 36; setfirst(buf); return buf[0]; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\t(hl),e");
    expect(sccAsm).toContain("\tld\ta,(hl)");
  });

  test("source mode supports local char array constant index assignments in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-array-assign-"));
    const inputFile = path.join(tempDir, "array-assign.c");
    fs.writeFileSync(inputFile, "int main(){ char buf[4]; buf[2] = 65; return buf[2]; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tld\thl,#2");
    expect(sccAsm).toContain("\tld\t(hl),#65");
    expect(sccAsm).toContain("\tld\tl,(hl)");
  });

  test("source mode supports local char array dynamic index reads and assignments in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-array-dynamic-"));
    const inputFile = path.join(tempDir, "array-dynamic.c");
    fs.writeFileSync(inputFile, "int main(){ int i = 1; char buf[4]; buf[i + 1] = 65; return buf[i]; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tadd\thl,de");
    expect(sccAsm).toContain("\tld\t(hl),e");
    expect(sccAsm).toContain("\tld\tl,(hl)");
  });

  test("source mode supports increment and decrement simple statements in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-inc-dec-"));
    const inputFile = path.join(tempDir, "inc-dec.c");
    fs.writeFileSync(inputFile, "int main(){ int i = 0; char buf[3]; i++; buf[0] = 66; buf[i]--; return buf[i]; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tadd\thl,de");
    expect(sccAsm).toContain("\tsbc\thl,de");
  });

  test("source mode supports prefix increment and decrement simple statements in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-prefix-inc-dec-"));
    const inputFile = path.join(tempDir, "prefix-inc-dec.c");
    fs.writeFileSync(inputFile, "int main(){ int i = 0; char buf[3]; ++i; buf[0] = 66; --buf[i]; return buf[i]; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tadd\thl,de");
    expect(sccAsm).toContain("\tsbc\thl,de");
  });

  test("source mode supports compound assignment simple statements in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-compound-assign-"));
    const inputFile = path.join(tempDir, "compound-assign.c");
    fs.writeFileSync(inputFile, "int main(){ int i = 1; char buf[3]; i += 2; buf[0] = 68; buf[i - 2] -= 3; return buf[0]; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tadd\thl,de");
    expect(sccAsm).toContain("\tsbc\thl,de");
  });

  test("source mode supports dereference simple statements and for-loop steps in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-deref-simple-"));
    const inputFile = path.join(tempDir, "deref-simple.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 0; int *p = &x; ++*p; *p += 2; (*p)--; for (; x < 3; ++*p) { break; } return x; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((sccAsm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(sccAsm).toContain("\tpush\tde");
  });

  test("source mode supports wider compound assignment operators in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-compound-ops-"));
    const inputFile = path.join(tempDir, "compound-ops.c");
    fs.writeFileSync(inputFile, "int main(){ int x = 3; char buf[2]; x <<= 1; buf[0] |= 2; x *= 4; return x; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.asl");
    expect(sccAsm).toContain("\tor\td");
    expect(sccAsm).toContain("\tcall\t.mul");
  });

  test("source mode supports switch statements in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-switch-"));
    const inputFile = path.join(tempDir, "switch.c");
    fs.writeFileSync(inputFile, "int pick(int x){ switch (x) { case 65: return 1; case 66: return 2; default: return 3; } }\nint main(){ return pick(66); }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect(sccAsm).toContain("\tcall\t.eq");
    expect(sccAsm).toContain("\tld\thl,#66");
    expect(sccAsm).toContain("\tld\thl,#2");
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
    expect((sccAsm.match(/\tcall\t\.gt/g) ?? []).length).toBeGreaterThanOrEqual(1);
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
    expect((sccAsm.match(/\tcall\t\.gt/g) ?? []).length).toBeGreaterThanOrEqual(1);
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
    expect((sccAsm.match(/\tcall\t\.gt/g) ?? []).length).toBeGreaterThanOrEqual(1);
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
    expect((sccAsm.match(/\tcall\t\.gt/g) ?? []).length).toBeGreaterThanOrEqual(1);
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

  test("source mode rejects aggregate assignment between mismatched aggregate types in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-assign-mismatch-"));
    const inputFile = path.join(tempDir, "aggregate-assign-mismatch.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nstruct Bar { char a; int b; };\nint main(){ struct Foo x; struct Bar y; x = y; return 0; }\n", "utf8");

    expect(() => adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    })).toThrow(/only supports aggregate assignment between matching struct types/);
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
    fs.writeFileSync(inputFile, "int main(){ switch (1) return 1; }\n", "utf8");

    expect(() => adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    })).toThrow(/only supports brace-wrapped switch bodies/);
  });

  test("source mode rejects control-flow nesting deeper than the compiler limit", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-nesting-limit-"));
    const inputFile = path.join(tempDir, "nesting-limit.c");
    fs.writeFileSync(inputFile, "int main(){ if (1) if (1) if (1) if (1) if (1) if (1) if (1) if (1) if (1) return 1; return 0; }\n", "utf8");

    expect(() => adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    })).toThrow(/nesting up to 8 levels/);
  });

  test("fixture-backed helper fragment mode still materializes SCC outputs", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-frag-helper-"));
    const adapter = new TsSccCompilerAdapter({ fixtureId: "frag-helper-call-scc" });
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile: path.join(tempDir, "frag-helper.c"),
      tempDir,
    });

    expect(fs.existsSync(built.sccAsmFile)).toBe(true);
    expect(fs.readFileSync(built.sccAsmFile, "utf8")).toBe(readSccFixture("frag-helper-call-scc"));
    expect(fs.existsSync(built.relFile)).toBe(true);
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

  test("source mode can link a direct external call against bundled CP/M runtime", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-frag-link-"));
    const inputFile = path.join(tempDir, "frag-call-source.c");
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    fs.writeFileSync(inputFile, "int main(){ return outstr(); }\n", "utf8");
    const programRel = new TsSccCompilerAdapter().compileToRel(createLogger("quiet"), {
      inputFile,
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

  test("source mode call statement with string literal links and produces CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-link-"));
    const inputFile = path.join(tempDir, "stmt-outstr-source.c");
    const runtimeAsmPath = path.join(tempDir, "cpmcrt.asm");
    const runtimeRelPath = path.join(tempDir, "cpmcrt.rel");
    fs.writeFileSync(inputFile, "int main(){ outstr(\"TS STMT$\"); return 0; }\n", "utf8");
    const programRel = new TsSccCompilerAdapter().compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    }).relFile;
    const outPath = path.join(tempDir, "stmt-outstr.com");

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

  test("source mode internal call result links and produces CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-call-link-"));
    const programRel = compileSourceRel(tempDir, "stmt-call-result-source.c", "int value(){ return 88; }\nint main(){ outchar(value()); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-call-result", programRel)).toBe("X");
  });

  test("source mode additive expressions link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-additive-link-"));
    const programRel = compileSourceRel(tempDir, "stmt-additive-source.c", "int sum(int a, int b){ return a + b; }\nint diff(int a, int b){ return a - b; }\nint main(){ outchar(sum(32, 33)); outchar(diff(70, 5)); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-additive", programRel)).toBe("AA");
  });

  test("source mode branch on internal call result links and takes the true branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-branch-link-"));
    const programRel = compileSourceRel(tempDir, "stmt-branch-source.c", "int flag(){ return 1; }\nint main(){ if (flag()) outchar(84); else outchar(70); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-branch", programRel)).toBe("T");
  });

  test("source mode local char slot links and round-trips stack-relative storage", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-local-link-"));
    const programRel = compileSourceRel(tempDir, "stmt-local-slot-source.c", "int main(){ char x = 76; outchar(x); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-local-slot", programRel)).toBe("L");
  });

  test("source mode constant compare links and takes the true branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-compare-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-compare-helper-source.c", "int main(){ if (66 > 65) outchar(89); else outchar(78); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-compare-helper", programRel, [helperRelPath])).toBe("Y");
  });

  test("source mode local compare links and uses stack-relative value in helper compare", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-local-compare-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-local-compare-source.c", "int main(){ char x = 67; if (x > 66) outchar(87); else outchar(88); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-local-compare", programRel, [helperRelPath])).toBe("W");
  });

  test("source mode local int links and round-trips 2-byte stack-relative storage", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-local-int-link-"));
    const programRel = compileSourceRel(tempDir, "stmt-local-int-source.c", "int main(){ int x = 90; outchar(x); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-local-int", programRel)).toBe("Z");
  });

  test("source mode eq compare links and takes the equal branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-eq-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-eq-helper-source.c", "int main(){ if (81 == 81) outchar(69); else outchar(88); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-eq-helper", programRel, [helperRelPath])).toBe("E");
  });

  test("source mode loop links and emits a countdown via back-edge branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-loop-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-loop-source.c", "int main(){ char x = 51; while (x > 48) { outchar(x); x = x - 1; } return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-loop", programRel, [helperRelPath], 4000)).toBe("321");
  });

  test("source mode for-loops with continue and break link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-for-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-for-source.c", "int main(){ int x = 65; for (x = 65; x < 69; x = x + 1) { if (x == 66) continue; outchar(x); if (x == 67) break; } return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-for", programRel, [helperRelPath], 4000)).toBe("AC");
  });

  test("source mode for-loop declaration initializers and unary minus link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-for-decl-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-for-decl-source.c", "int main(){ for (int x = 1; x < 4; x = x + 1) outchar(-(-64) + x); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-for-decl", programRel, [helperRelPath], 4000)).toBe("ABC");
  });

  test("source mode logical-not expressions link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-not-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-not-source.c", "int main(){ outchar(!0 + 64); outchar(!1 + 64); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-not", programRel, [helperRelPath], 4000)).toBe("A@");
  });

  test("source mode logical and/or expressions short-circuit and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-logical-link-"));
    const emitxRelPath = assembleEmitCharRuntime(tempDir, "emitx", 88);
    const programRel = compileSourceRel(tempDir, "stmt-logical-source.c", "int emitx(); int main(){ if (1 || emitx()) outchar(65); if (0 && emitx()) outchar(66); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-logical", programRel, [emitxRelPath], 4000)).toBe("A");
  });

  test("source mode bitwise expressions link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-bitwise-link-"));
    const programRel = compileSourceRel(tempDir, "stmt-bitwise-source.c", "int main(){ outchar((65 & 127)); outchar((64 | 2)); outchar((66 ^ 1)); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-bitwise", programRel, [], 4000)).toBe("ABC");
  });

  test("source mode bitwise-not expressions link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-bitnot-link-"));
    const programRel = compileSourceRel(tempDir, "stmt-bitnot-source.c", "int main(){ outchar(~190); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-bitnot", programRel, [], 4000)).toBe("A");
  });

  test("source mode multiplicative and shift expressions link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-helper-ops-link-"));
    const helperRelPath = assembleMulShiftHelperRuntime(tempDir);
    const programRel = compileSourceRel(
      tempDir,
      "stmt-helper-ops-source.c",
      "int main(){ outchar(5 * 13); outchar(33 << 1); outchar((16 << 2) + 3); outchar(17 << 2); outchar(138 >> 1); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-helper-ops", programRel, [helperRelPath], 4000)).toBe("ABCDE");
  });

  test("source mode switch statements link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-switch-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(
      tempDir,
      "stmt-switch-source.c",
      "int emit(int x){ switch (x) { case 65: outchar(65); break; case 66: outchar(66); break; default: outchar(67); } return 0; }\nint main(){ emit(66); emit(77); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-switch", programRel, [helperRelPath], 4000)).toBe("BC");
  });

  test("source mode do-while loops link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-do-while-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(
      tempDir,
      "stmt-do-while-source.c",
      "int main(){ char x = 65; do { outchar(x); x = x + 1; } while (x < 68); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-do-while", programRel, [helperRelPath], 4000)).toBe("ABC");
  });

  test("source mode local char array constant index assignments link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-array-assign-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-array-assign-source.c",
      "int main(){ char buf[4]; buf[0] = 65; buf[1] = 66; outchar(buf[0]); outchar(buf[1]); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-array-assign", programRel)).toBe("AB");
  });

  test("source mode char array string literal initializers link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-array-string-init-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-array-string-init-source.c",
      "int main(){ char buf[] = \"AB$\"; outstr(buf); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-array-string-init", programRel)).toBe("AB");
  });

  test("source mode exact-fit char array string literal initializers link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-array-string-init-exact-fit-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-array-string-init-exact-fit-source.c",
      "int main(){ char buf[2] = \"AB\"; outchar(buf[0]); outchar(buf[1]); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-array-string-init-exact-fit", programRel)).toBe("AB");
  });

  test("source mode unsized char array parameters link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-param-array-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-param-array-source.c",
      "int emit(char s[]){ outstr(s); return 0; }\nint main(){ char buf[4]; buf[0] = 65; buf[1] = 66; buf[2] = 36; buf[3] = 0; emit(buf); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-param-array", programRel)).toBe("AB");
  });

  test("source mode unsized char array parameter reads link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-param-array-read-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-param-array-read-source.c",
      "char first(char s[]){ return s[0]; }\nint main(){ char buf[3]; buf[0] = 65; buf[1] = 36; outchar(first(buf)); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-param-array-read", programRel)).toBe("A");
  });

  test("source mode unsized char array parameter writes link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-param-array-write-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-param-array-write-source.c",
      "int setfirst(char s[]){ s[0] = 66; return 0; }\nint main(){ char buf[3]; buf[0] = 65; buf[1] = 36; setfirst(buf); outchar(buf[0]); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-param-array-write", programRel)).toBe("B");
  });

  test("source mode local char array dynamic index reads and assignments link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-array-dynamic-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(
      tempDir,
      "stmt-array-dynamic-source.c",
      "int main(){ int i = 0; char buf[3]; do { buf[i] = 65 + i; i = i + 1; } while (i < 3); i = 0; do { outchar(buf[i]); i = i + 1; } while (i < 3); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-array-dynamic", programRel, [helperRelPath], 4000)).toBe("ABC");
  });

  test("source mode increment and decrement simple statements link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-inc-dec-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(
      tempDir,
      "stmt-inc-dec-source.c",
      "int main(){ int i = 0; char buf[3]; do { buf[i] = 65; buf[i]++; outchar(buf[i]); i++; } while (i < 3); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-inc-dec", programRel, [helperRelPath], 4000)).toBe("BBB");
  });

  test("source mode prefix increment and decrement simple statements link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-prefix-inc-dec-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(
      tempDir,
      "stmt-prefix-inc-dec-source.c",
      "int main(){ int i = -1; char buf[3]; do { ++i; buf[i] = 66; --buf[i]; outchar(buf[i]); } while (i < 2); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-prefix-inc-dec", programRel, [helperRelPath], 4000)).toBe("AAA");
  });

  test("source mode compound assignment simple statements link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-compound-assign-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(
      tempDir,
      "stmt-compound-assign-source.c",
      "int main(){ int i = 0; char buf[3]; do { buf[i] = 65; buf[i] += i; outchar(buf[i]); i += 1; } while (i < 3); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-compound-assign", programRel, [helperRelPath], 4000)).toBe("ABC");
  });

  test("source mode conditional aggregate member paths link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-member-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-member-source.c",
      "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; (*(c ? p : q)).a = 65; (*(c ? p : q)).b = 66; outchar((*(c ? p : q)).a); outchar((*(c ? p : q)).b); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-member", programRel, [], 4000)).toBe("AB");
  });

  test("source mode conditional pointer-member paths link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-pointer-member-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-pointer-member-source.c",
      "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; (c ? p : q)->a = 65; (c ? p : q)->b = 66; outchar((c ? p : q)->a); outchar((c ? p : q)->b); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-pointer-member", programRel, [], 4000)).toBe("AB");
  });

  test("source mode conditional aggregate member address-of paths link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-member-address-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-member-address-source.c",
      "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; (*(c ? p : q)).a = 65; (*(c ? p : q)).b = 66; outchar(first(&(*(c ? p : q)).a)); outchar(second(&(*(c ? p : q)).b)); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-member-address", programRel, [], 4000)).toBe("AB");
  });

  test("source mode conditional pointer-member address-of paths link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-pointer-member-address-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-pointer-member-address-source.c",
      "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; (c ? p : q)->a = 65; (c ? p : q)->b = 66; outchar(first(&(c ? p : q)->a)); outchar(second(&(c ? p : q)->b)); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-pointer-member-address", programRel, [], 4000)).toBe("AB");
  });

  test("source mode local aggregate assignment statements link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-assign-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-assign-source.c",
      "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ struct Foo x; struct Foo y; union Bar u; union Bar v; y.a = 65; y.b = 66; v.a = 67; x = y; u = v; outchar(x.a); outchar(x.b); outchar(u.a); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-assign", programRel, [], 4000)).toBe("ABC");
  });

  test("source mode aggregate conditional and comma assignment expressions link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-assign-expr-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-assign-expr-source.c",
      "struct Foo { char a; int b; };\nint main(){ int c = 0; int side = 0; struct Foo x; struct Foo y; struct Foo z; y.a = 65; y.b = 66; z.a = 67; z.b = 68; x = c ? y : z; outchar(x.a); outchar(x.b); x = (side = 1, y); outchar(x.a); outchar(x.b); outchar(side + 48); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-assign-expr", programRel, [], 4000)).toBe("CDAB1");
  });

  test("source mode member reads from conditional and comma aggregate values link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-value-member-read-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-value-member-read-source.c",
      "struct Foo { char a; int b; };\nint main(){ int c = 0; int side = 0; struct Foo x; struct Foo y; x.a = 65; x.b = 66; y.a = 67; y.b = 68; outchar((c ? x : y).a); outchar(((side = 1), y).b); outchar(side + 48); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-value-member-read", programRel, [], 4000)).toBe("CD1");
  });

  test("source mode address-of on fields from conditional, comma, and assign-expression aggregate values link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-value-field-address-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-value-field-address-source.c",
      "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; x.a = 69; x.b = 70; return x; }\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(){ int c = 0; int side = 0; struct Foo x; struct Foo y; x.a = 65; x.b = 66; y.a = 67; y.b = 68; outchar(first(&(c ? x : y).a)); outchar(second(&((side = 1), y).b)); outchar(first(&((x = make()).a))); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-value-field-address", programRel, [], 4000)).toBe("CDE");
  });

  test("source mode aggregate call arguments link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-call-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-call-source.c",
      "struct Foo { char a; int b; };\nint take(struct Foo a){ return a.a + a.b; }\nint main(){ struct Foo x; x.a = 65; x.b = 1; outchar(take(x)); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-call", programRel, [], 4000)).toBe("B");
  });

  test("source mode aggregate return values link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-return-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-return-source.c",
      "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; x.a = 65; x.b = 66; return x; }\nint main(){ struct Foo y; y = make(); outchar(y.a); outchar(y.b); outchar(make().a); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-return", programRel, [], 4000)).toBe("ABA");
  });

  test("source mode nested aggregate-returning calls link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-return-nested-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-return-nested-source.c",
      "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; x.a = 65; x.b = 66; return x; }\nstruct Foo id(struct Foo x){ return x; }\nint take(struct Foo x){ return x.b; }\nint main(){ struct Foo y = make(); outchar(take(make())); outchar(id(make()).a); outchar(y.b); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-return-nested", programRel, [], 4000)).toBe("BAB");
  });

  test("source mode conditional and comma aggregate-returning call value paths link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-return-conditional-comma-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-return-conditional-comma-source.c",
      "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; x.a = 65; x.b = 66; return x; }\nstruct Foo id(struct Foo x){ return x; }\nint take(struct Foo x){ return x.a; }\nint main(int c){ int side = 0; struct Foo y = c ? make() : id(make()); outchar(take(c ? make() : y)); outchar(((side = 1), make()).b); outchar(side + 64); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-return-conditional-comma", programRel, [], 4000)).toBe("ABA");
  });

  test("source mode supports aggregate return pass-through for conditional, comma, and assign-expression values in the Phase C subset", () => {
    const adapter = new TsSccCompilerAdapter();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-source-aggregate-return-pass-through-"));
    const inputFile = path.join(tempDir, "aggregate-return-pass-through.c");
    fs.writeFileSync(inputFile, "struct Foo { char a; int b; };\nstruct Foo makeA(){ struct Foo x; x.a = 65; x.b = 1; return x; }\nstruct Foo makeB(){ struct Foo x; x.a = 66; x.b = 2; return x; }\nstruct Foo pick(int c){ struct Foo x = makeA(); struct Foo y = makeB(); return c ? x : y; }\nstruct Foo passthroughComma(){ int side = 0; struct Foo y = makeA(); return ((side = 1), y); }\nstruct Foo passthroughAssign(){ struct Foo z; return (z = makeB()); }\nint main(){ struct Foo x = pick(0); struct Foo y = passthroughComma(); struct Foo z = passthroughAssign(); return x.a + y.a + z.a; }\n", "utf8");
    const built = adapter.compileToRel(createLogger("quiet"), {
      inputFile,
      tempDir,
    });

    const sccAsm = fs.readFileSync(built.sccAsmFile, "utf8");
    expect((sccAsm.match(/\tcall\tpick/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tcall\tpassthroughComma/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tcall\tpassthroughAssign/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((sccAsm.match(/\tcall\tmakeA/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((sccAsm.match(/\tcall\tmakeB/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("source mode aggregate conditional return pass-through links and produces CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-return-pass-through-conditional-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-return-pass-through-conditional-source.c",
      "struct Foo { char a; int b; };\nstruct Foo makeA(){ struct Foo x; x.a = 65; x.b = 1; return x; }\nstruct Foo makeB(){ struct Foo x; x.a = 66; x.b = 2; return x; }\nstruct Foo pick(int c){ struct Foo x = makeA(); struct Foo y = makeB(); return c ? x : y; }\nint main(){ struct Foo z = pick(0); outchar(z.a); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-return-pass-through-conditional", programRel, [], 4000)).toBe("B");
  });

  test("source mode aggregate comma return pass-through links and produces CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-return-pass-through-comma-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-return-pass-through-comma-source.c",
      "struct Foo { char a; int b; };\nstruct Foo makeA(){ struct Foo x; x.a = 65; x.b = 1; return x; }\nstruct Foo passthroughComma(){ int side = 0; struct Foo y = makeA(); return ((side = 1), y); }\nint main(){ struct Foo z = passthroughComma(); outchar(z.a); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-return-pass-through-comma", programRel, [], 4000)).toBe("A");
  });

  test("source mode aggregate assign-expression return pass-through links and produces CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-return-pass-through-assign-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-return-pass-through-assign-source.c",
      "struct Foo { char a; int b; };\nstruct Foo makeB(){ struct Foo x; x.a = 66; x.b = 2; return x; }\nstruct Foo passthroughAssign(){ struct Foo z; return (z = makeB()); }\nint main(){ struct Foo z = passthroughAssign(); outchar(z.a); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-return-pass-through-assign", programRel, [], 4000)).toBe("B");
  });

  test("source mode branch-local aggregate declaration initializers link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-branch-local-init-link-"));
    const trueRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-branch-local-init-true-source.c",
      "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; x.a = 65; x.b = 66; return x; }\nint main(){ int c = 1; if (c) { struct Foo y = make(); outchar(y.a); } else { struct Foo z = make(); outchar(z.b); } return 0; }\n",
    );
    const falseRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-branch-local-init-false-source.c",
      "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; x.a = 65; x.b = 66; return x; }\nint main(){ int c = 0; if (c) { struct Foo y = make(); outchar(y.a); } else { struct Foo z = make(); outchar(z.b); } return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-branch-local-init-true", trueRel, [], 4000)).toBe("A");
    expect(linkAndRunCom(tempDir, "stmt-aggregate-branch-local-init-false", falseRel, [], 4000)).toBe("B");
  });

  test("source mode aggregate assignment expression results link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-assign-expr-result-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-assign-expr-result-source.c",
      "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; x.a = 65; x.b = 66; return x; }\nint take(struct Foo x){ return x.b; }\nint main(){ struct Foo x; outchar((x = make()).a); outchar(take(x = make())); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-assign-expr-result", programRel, [], 4000)).toBe("AB");
  });

  test("source mode loop-local aggregate declaration initializers link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-loop-local-init-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-loop-local-init-source.c",
      "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; x.a = 65; x.b = 66; return x; }\nint main(){ int i = 0; while (i == 0) { struct Foo y = make(); outchar(y.a); i = y.a; } for (; i == 65; i = 66) { struct Foo z = make(); outchar(z.b); } do { struct Foo w = make(); outchar(w.a); } while (0); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-loop-local-init", programRel, [helperRelPath], 4000)).toBe("ABA");
  });

  test("source mode chained aggregate value call paths link and produce CP/M output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-aggregate-chained-value-link-"));
    const programRel = compileSourceRel(
      tempDir,
      "stmt-aggregate-chained-value-source.c",
      "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; x.a = 65; x.b = 66; return x; }\nstruct Foo id(struct Foo x){ return x; }\nint take(struct Foo x){ return x.a; }\nint main(int c){ outchar(id(id(make())).a); outchar(take(id(make()))); outchar((c ? id(make()) : make()).b); return 0; }\n",
    );
    expect(linkAndRunCom(tempDir, "stmt-aggregate-chained-value", programRel, [], 4000)).toBe("AAB");
  });

  test("source mode char argument reads a stack argument and returns it", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-arg-char-link-"));
    const programRel = compileSourceRel(tempDir, "stmt-arg-char-source.c", "char echo(char a){ return a; }\nint main(){ outchar(echo(65)); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-arg-char", programRel)).toBe("A");
  });

  test("source mode arg non-equal compare reads an argument and takes the non-equal branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-arg-ne-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-arg-ne-helper-source.c", "int check(char a){ return a != 65; }\nint main(){ if (check(66)) outchar(78); else outchar(88); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-arg-ne-helper", programRel, [helperRelPath])).toBe("N");
  });

  test("source mode int argument reads a 2-byte stack argument and returns it", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-arg-int-link-"));
    const programRel = compileSourceRel(tempDir, "stmt-arg-int-source.c", "int echo16(int a){ return a; }\nint main(){ outchar(echo16(90)); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-arg-int", programRel)).toBe("Z");
  });

  test("source mode two-char-arg call reads the older stack argument via a larger offset", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-two-arg-link-"));
    const programRel = compileSourceRel(tempDir, "stmt-two-arg-char-source.c", "char pickfirst(char a, char b){ return a; }\nint main(){ outchar(pickfirst(65, 66)); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-two-arg-char", programRel)).toBe("A");
  });

  test("source mode int argument eq compare takes the equal branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-arg-int-eq-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-arg-int-eq-helper-source.c", "int check16(int a){ return a == 90; }\nint main(){ if (check16(90)) outchar(73); else outchar(88); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-arg-int-eq-helper", programRel, [helperRelPath])).toBe("I");
  });

  test("source mode two-arg non-equal compare takes the non-equal branch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-two-arg-ne-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-two-arg-ne-helper-source.c", "int checkpair(char a, char b){ return a != b; }\nint main(){ if (checkpair(65, 66)) outchar(68); else outchar(88); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-two-arg-ne-helper", programRel, [helperRelPath])).toBe("D");
  });

  test("source mode mixed two-arg call evaluates a local caller expression before pushing arguments", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-call-two-arg-mixed-link-"));
    const programRel = compileSourceRel(tempDir, "stmt-call-two-arg-mixed-source.c", "char pickfirst(char a, char b){ return a; }\nint main(){ char x = 67; outchar(pickfirst(x, 68)); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-call-two-arg-mixed", programRel)).toBe("C");
  });

  test("source mode local two-arg non-equal compare checks a caller local against a constant argument", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-two-arg-local-ne-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-two-arg-local-ne-helper-source.c", "int checkpair(char a, char b){ return a != b; }\nint main(){ char x = 67; if (checkpair(x, 68)) outchar(77); else outchar(88); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-two-arg-local-ne-helper", programRel, [helperRelPath])).toBe("M");
  });

  test("source mode local int vs arg int eq compare checks a callee-local 16-bit slot against a 16-bit argument", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-local-int-arg-int-eq-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-local-int-arg-int-eq-helper-source.c", "int checkmix(int a){ int x = 90; return x == a; }\nint main(){ if (checkmix(90)) outchar(81); else outchar(88); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-local-int-arg-int-eq-helper", programRel, [helperRelPath])).toBe("Q");
  });

  test("source mode local int vs arg int non-equal compare checks a callee-local 16-bit slot against a different 16-bit argument", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-local-int-arg-int-ne-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-local-int-arg-int-ne-helper-source.c", "int checkmixne(int a){ int x = 90; return x != a; }\nint main(){ if (checkmixne(91)) outchar(82); else outchar(88); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-local-int-arg-int-ne-helper", programRel, [helperRelPath])).toBe("R");
  });

  test("source mode mixed two-int-arg call evaluates a local 16-bit caller expression before pushing arguments", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-call-two-arg-int-mixed-link-"));
    const programRel = compileSourceRel(tempDir, "stmt-call-two-arg-int-mixed-source.c", "int pickfirst16(int a, int b){ return a; }\nint main(){ int x = 83; outchar(pickfirst16(x, 84)); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-call-two-arg-int-mixed", programRel)).toBe("S");
  });

  test("source mode local int vs arg int greater-than compare checks a larger callee-local 16-bit slot against a smaller 16-bit argument", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-local-int-arg-int-gt-link-"));
    const helperRelPath = assembleCompareHelperRuntime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-local-int-arg-int-gt-helper-source.c", "int checkmixgt(int a){ int x = 91; return x > a; }\nint main(){ if (checkmixgt(90)) outchar(84); else outchar(88); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-local-int-arg-int-gt-helper", programRel, [helperRelPath])).toBe("T");
  });

  test("source mode extern two-arg int call pushes a local 16-bit value and calls an external routine", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ts-stmt-extern-two-arg-int-link-"));
    const helperRelPath = assemblePickFirst16Runtime(tempDir);
    const programRel = compileSourceRel(tempDir, "stmt-extern-two-arg-int-call-source.c", "int pickfirst16(int a, int b); int main(){ int x = 85; outchar(pickfirst16(x, 86)); return 0; }\n");
    expect(linkAndRunCom(tempDir, "stmt-extern-two-arg-int-call", programRel, [helperRelPath])).toBe("U");
  });
  });

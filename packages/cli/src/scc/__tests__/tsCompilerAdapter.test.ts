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

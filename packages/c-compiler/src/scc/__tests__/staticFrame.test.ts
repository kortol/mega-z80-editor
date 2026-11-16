import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createArchive, createLogger, Z80DebugCore } from "@mz80/core";
import { TsSccCompilerAdapter } from "../tsCompilerAdapter";
import { compileSccProgram } from "../compileProgram";
import { validateTsAbiLinkInputs } from "../abiLinkCheck";

function compile(source: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-static-frame-"));
  const inputFile = path.join(tempDir, "main.c");
  fs.writeFileSync(inputFile, source);
  const adapter = new TsSccCompilerAdapter({ abi: "ts-static-frame" });
  return { tempDir, inputFile, adapter };
}

test("static frames preserve nested arguments, pointer locals and repeated activation", () => {
  const { tempDir, inputFile, adapter } = compile(
    "int add(int a,int b){int x=a+b;return x;} int leaf(int *p){int x=*p;return x+1;} int mid(int *p){return leaf(p)+1;} int main(){int x=63;int *p=&x;outchar(mid(p));outchar(add(1,add(30,34)));outchar(add(32,33));return 0;}"
  );
  const result = adapter.compileToRel(createLogger("quiet"), { inputFile, tempDir });
  const asm = fs.readFileSync(result.sccAsmFile, "utf8");
  expect(asm).toContain(".__ts_sf_add:");
  expect(asm).not.toMatch(/\b(?:dec|inc)\s+sp/);
  const outputFile = path.join(tempDir, "main.com");
  compileSccProgram(createLogger("quiet"), {
    inputFile, outputFile, tempDir, runtime: "cpmcrt", com: true,
  }, { compilerAdapter: adapter });
  const core = new Z80DebugCore(false);
  core.setCpm22Enabled(true);
  core.setAllowOutOfImage(true);
  core.loadImage(fs.readFileSync(outputFile), 0x100);
  core.setEntry(0x100);
  expect(core.run(15000).reason).toBe("BDOS 0: terminate");
  expect(core.getOutput()).toBe("AAA");
});

test.each([
  ["int f(){return f();} int main(){return f();}", "recursive"],
  ["int g(); int f(){return g();} int g(){return f();} int main(){return f();}", "recursive"],
  ["int host(int x); int main(){return host(1);}", "external user call"],
  ["int f(int x,...){return x;} int main(){return f(1,2);}", "variadic"],
  ["struct S{int x;}; int main(){struct S s={1};return s.x;}", "aggregate"],
  ["int f(){return 1;} int main(){int (*p)()=f;return p();}", "function-pointer"],
])("static-frame rejects unsupported activation: %s", (source, diagnostic) => {
  const { tempDir, inputFile, adapter } = compile(source);
  expect(() => adapter.compileToRel(createLogger("quiet"), { inputFile, tempDir })).toThrow(diagnostic);
});

test("static-frame char parameters bridge to structured runtime puts", () => {
  const { tempDir, inputFile, adapter } = compile(
    '#include <stdio.h>\nchar id(char ch){char local=ch;return local;} int main(){putchar(id(65));puts("BC");return 0;}'
  );
  const outputFile = path.join(tempDir, "main.com");
  compileSccProgram(createLogger("quiet"), {
    inputFile, outputFile, tempDir, runtime: { platform: "cpm", profile: "lite" }, com: true,
  }, { compilerAdapter: adapter });
  const core = new Z80DebugCore(false);
  core.setCpm22Enabled(true);
  core.setAllowOutOfImage(true);
  core.loadImage(fs.readFileSync(outputFile), 0x100);
  core.setEntry(0x100);
  expect(core.run(15000).reason).toBe("BDOS 0: terminate");
  expect(core.getOutput()).toBe("ABC\n");
});

test("link preflight rejects stack callers of static-frame exports, including archives", () => {
  const unit = compile("int value(int x){return x;} int main(){return value(1);}");
  const staticRel = unit.adapter.compileToRel(createLogger("quiet"), unit).relFile;
  const caller = path.join(unit.tempDir, "caller.c");
  fs.writeFileSync(caller, "int value(int x); int caller(){return value(65);}");
  const internalRel = new TsSccCompilerAdapter().compileToRel(createLogger("quiet"), {
    inputFile: caller, tempDir: unit.tempDir,
  }).relFile;
  expect(() => validateTsAbiLinkInputs([internalRel, staticRel])).toThrow("ABI mismatch");
  const archive = path.join(unit.tempDir, "static.lib");
  createArchive([staticRel], archive);
  expect(() => validateTsAbiLinkInputs([internalRel, archive])).toThrow("ABI mismatch");
});

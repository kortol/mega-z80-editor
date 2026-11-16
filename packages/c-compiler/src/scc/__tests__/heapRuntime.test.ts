import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger, Z80DebugCore } from "@mz80/core";
import { compileSccProgram } from "../compileProgram";
import { TsSccCompilerAdapter } from "../tsCompilerAdapter";
import { assemble } from "@mz80/assembler";
import { translateSccAsm } from "../translateAsm";

function run(source: string, abi: "ts-internal" | "ts-static-frame", exitStatus?: number) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-heap-"));
  const inputFile = path.join(tempDir, "heap.c");
  const outputFile = path.join(tempDir, "heap.com");
  fs.writeFileSync(inputFile, '#include <stdlib.h>\n#include <stdio.h>\n#include <mz80.h>\n' + source);
  // The current lite CRT does not provide the compiler's comparison helpers.
  const helperAsm = path.join(tempDir, "compare.asm");
  const helperRel = path.join(tempDir, "compare.rel");
  fs.writeFileSync(helperAsm, translateSccAsm([
    "\t.globl\t.eq", "\t.globl\t.ne", "\t.area\t_CODE",
    ".eq:", "\tor\ta", "\tsbc\thl,de", "\tld\thl,#0", "\tret\tnz", "\tinc\thl", "\tret",
    ".ne:", "\tor\ta", "\tsbc\thl,de", "\tld\thl,#0", "\tret\tz", "\tinc\thl", "\tret",
  ].join("\n")));
  expect(assemble(createLogger("quiet"), helperAsm, helperRel, { relVersion: 2 }).errors).toEqual([]);
  compileSccProgram(createLogger("quiet"), {
    inputFile, outputFile, tempDir, runtime: { platform: "cpm", profile: "full" }, libraries: [helperRel], com: true,
    map: true,
  }, { compilerAdapter: new TsSccCompilerAdapter({ abi }) });
  const core = new Z80DebugCore(false);
  core.setCpm22Enabled(true);
  core.setAllowOutOfImage(true);
  core.loadImage(fs.readFileSync(outputFile), 0x100);
  core.setEntry(0x100);
  expect(core.run(200000).reason).toBe("BDOS 0: terminate");
  if (exitStatus !== undefined) {
    const registers = core.getRegisters();
    // At BDOS termination SP points to the return address of call exit.
    // Validate the ABI argument slot, which also survives emulator fast paths.
    const argument = core.readMemory(registers.sp + 2, 2);
    expect(argument[0] + argument[1] * 256).toBe(exitStatus);
  }
  return core.getOutput();
}

test.each(["ts-internal", "ts-static-frame"] as const)("heap init, split, write and reuse through %s", (abi) => {
  expect(run(
    'char arena[128]; int main(){char *p;char *q;void *v; if(malloc(1)==NULL) putchar(65); if(mz80_heap_init(arena,128)) putchar(66); v=malloc(5); p=(char *)v; q=(char *)malloc(8); p[0]=67;p[4]=68;q[0]=69;putchar(p[0]);putchar(p[4]);putchar(q[0]);free(v);v=malloc(5);if((char *)v==p) putchar(70);free(v);free(q);v=malloc(120);if(v!=NULL) putchar(71);free(v);return 0;}', abi
  )).toBe("ABCDEFG");
});

test.each(["ts-internal", "ts-static-frame"] as const)("heap failure, alignment, exhaustion and bidirectional coalescing through %s", (abi) => {
  expect(run(
    'char arena[96]; int main(){char *a;char *b;char *c;char *d; if(mz80_heap_init(arena+1,95)) putchar(65);a=(char *)malloc(12);b=(char *)malloc(12);c=(char *)malloc(12);d=(char *)malloc(12);if(((int)a&1)==0) putchar(66);if(malloc(80)==NULL)putchar(67);free(a);free(c);free(b);a=(char *)malloc(40);if(a!=NULL)putchar(68);free(a);free(d);if(malloc(80)!=NULL)putchar(69);if(malloc(0)==NULL)putchar(70);if(malloc(-1)==NULL)putchar(71);free(NULL);if(mz80_heap_init(NULL,96)==0)putchar(72);if(malloc(1)==NULL)putchar(73);return 0;}', abi
  )).toBe("ABCDEFGHI");
});

test("heap rejects short arenas, wrap and oversized requests without damaging a live block", () => {
  expect(run(
    'char arena[64]; int main(){char *p;if(mz80_heap_init(arena,5)==0)putchar(65);if(mz80_heap_init((void *)65530,20)==0)putchar(66);if(mz80_heap_init(arena,64))putchar(67);p=(char *)malloc(2);p[0]=68;if(malloc(32767)==NULL)putchar(p[0]);if(malloc(64)==NULL)putchar(69);if(p[0]==68)putchar(70);return 0;}', "ts-internal"
  )).toBe("ABCDEF");
});

test("unused heap archive member is not extracted", () => {
  // A normal full-runtime application must not gain allocator state.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-no-heap-"));
  const inputFile = path.join(tempDir, "main.c");
  const outputFile = path.join(tempDir, "main.com");
  fs.writeFileSync(inputFile, '#include <stdio.h>\nint main(){puts("ok");return 0;}');
  compileSccProgram(createLogger("quiet"), {
    inputFile, outputFile, tempDir, runtime: { platform: "cpm", profile: "full" }, com: true, map: true,
  }, { compilerAdapter: new TsSccCompilerAdapter() });
  expect(fs.readFileSync(path.join(tempDir, "main.map"), "utf8")).not.toMatch(/MZ80_HEAP|MZ80C.HEAP/i);
});

test("void pointers support implicit object-pointer conversions and reject dereference/arithmetic", () => {
  expect(run('char arena[64]; int main(){void *p;char *q;mz80_heap_init(arena,64);p=malloc(2);q=p;q[0]=65;putchar(q[0]);free(q);return 0;}', "ts-internal")).toBe("A");
  for (const expression of ["*p", "p+1", "p++", "p+=1"]) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-void-ptr-"));
    const inputFile = path.join(tempDir, "main.c");
    fs.writeFileSync(inputFile, `int main(){void *p;return ${expression};}`);
    expect(() => new TsSccCompilerAdapter().compileToRel(createLogger("quiet"), { inputFile, tempDir })).toThrow();
  }
});

test.each(["ts-internal", "ts-static-frame"] as const)("calloc overflow, zeroing and reuse through %s", (abi) => {
  expect(run(
    'char arena[128];int main(){char *p;mz80_heap_init(arena,128);mz80_heap_set_debug(1);p=malloc(12);p[0]=88;p[11]=89;free(p);p=calloc(3,4);if(p[0]==0)putchar(65);if(p[11]==0)putchar(66);p[11]=67;putchar(p[11]);if(calloc(30000,3)==NULL)putchar(68);if(calloc(0,4)==NULL)putchar(69);if(calloc(2,-1)==NULL)putchar(70);if(calloc(32767,2)==NULL)putchar(71);if(calloc(1,32767)==NULL)putchar(72);free(p);if(mz80_heap_check())putchar(73);return 0;}', abi
  )).toBe("ABCDEFGHI");
});

test.each(["ts-internal", "ts-static-frame"] as const)("realloc shrink, adjacent growth, move and failure atomicity through %s", (abi) => {
  expect(run(
    'char arena[256];int main(){char *p;char *q;char *r;char *s;mz80_heap_init(arena,256);mz80_heap_set_debug(1);p=realloc(NULL,40);p[0]=65;p[7]=66;q=realloc(p,8);if(q==p)putchar(q[0]);if(q[7]==66)putchar(66);r=malloc(8);r[0]=67;q=realloc(q,48);if(q!=p)putchar(r[0]);if(q[0]==65)putchar(68);if(q[7]==66)putchar(69);s=realloc(q,30000);if(s==NULL)putchar(70);if(q[0]==65)putchar(71);if(r[0]==67)putchar(72);free(r);p=realloc(q,80);if(p==q)putchar(73);if(realloc(p,0)==NULL)putchar(74);if(mz80_heap_check())putchar(75);if(malloc(240)!=NULL)putchar(76);return 0;}', abi
  )).toBe("ABCDEFGHIJKL");
});

test.each(["ts-internal", "ts-static-frame"] as const)("heap debug check and high-address arena through %s", (abi) => {
  expect(run(
    'int main(){char *p;char *q;if(mz80_heap_check()==0)putchar(65);mz80_heap_set_debug(1);if(malloc(2)==NULL)putchar(66);if(mz80_heap_init((void *)36865,255))putchar(67);p=calloc(2,8);p[0]=68;q=realloc(p,40);putchar(q[0]);if(((int)q&1)==0)putchar(69);free(q);if(mz80_heap_check())putchar(70);p=malloc(240);if(p!=NULL)putchar(71);return 0;}', abi
  )).toBe("ABCDEFG");
});

test.each(["ts-internal", "ts-static-frame"] as const)("heap preserves arena canaries during fragmentation through %s", (abi) => {
  expect(run(
    'char arena[98];int main(){char *p;char *q;arena[0]=65;arena[97]=66;mz80_heap_init(arena+1,95);mz80_heap_set_debug(1);p=malloc(9);q=calloc(3,3);p[0]=67;q[8]=68;p=realloc(p,20);free(q);free(p);if(mz80_heap_check())putchar(arena[0]);putchar(arena[97]);return 0;}', abi
  )).toBe("AB");
});

test.each(["ts-internal", "ts-static-frame"] as const)("heap check rejects metadata corruption without following invalid links through %s", (abi) => {
  expect(run(
    'char arena[64];int main(){char *p;char *header;int *link;mz80_heap_init(arena,64);p=malloc(8);p[-4]=0;p[-3]=0;if(mz80_heap_check()==0)putchar(65);mz80_heap_init(arena,64);p=malloc(8);free(p);p[-2]=1;p[-1]=0;if(mz80_heap_check()==0)putchar(66);mz80_heap_init(arena,64);p=malloc(8);free(p);header=p-2;link=(int *)header;header=p-4;*link=(int)header;if(mz80_heap_check()==0)putchar(67);return 0;}', abi
  )).toBe("ABC");
});

const invalidHeapOperations = [
  "free(p);free(p);",
  "free(p+1);",
  "free((void *)1);",
  "p[-4]=0;p[-3]=0;malloc(2);",
  "free(p);p[-2]=1;p[-1]=0;malloc(2);",
  "realloc(p+1,20);",
];
test.each((["ts-internal", "ts-static-frame"] as const).flatMap((abi) =>
  invalidHeapOperations.map((operation) => [abi, operation] as const)
))("debug exits with status 1 through %s after: %s", (abi, operation) => {
  expect(run(
    'char arena[64];int main(){char *p;mz80_heap_init(arena,64);mz80_heap_set_debug(1);p=malloc(8);putchar(65);' + operation + 'putchar(90);return 0;}', abi, 1
  )).toBe("A");
});

test.each(["ts-internal", "ts-static-frame"] as const)("realloc minimum split, odd sizes and invalid requests through %s", (abi) => {
  expect(run(
    'char arena[34];int main(){char *p;char *q;mz80_heap_init(arena+((int)arena&1),32);mz80_heap_set_debug(1);p=malloc(25);p[24]=65;q=realloc(p,27);if(q==p)putchar(q[24]);q=realloc(p,23);if(q==p)putchar(66);if(malloc(1)==NULL)putchar(67);q=realloc(p,21);if(q==p)putchar(68);q=malloc(2);if(q!=NULL)putchar(69);if(realloc(p,-1)==NULL)putchar(70);if(realloc(p,32767)==NULL)putchar(71);free(q);free(p);if(mz80_heap_check())putchar(72);if(calloc(-1,1)==NULL)putchar(73);if(calloc(1,0)==NULL)putchar(74);return 0;}', abi
  )).toBe("ABCDEFGHIJ");
});

test.each(["ts-internal", "ts-static-frame"] as const)("heap check rejects short and oversized headers without mutating them through %s", (abi) => {
  expect(run(
    'char arena[64];int main(){char *p;mz80_heap_init(arena,64);p=malloc(8);p[-4]=4;p[-3]=0;if(mz80_heap_check()==0)putchar(65);if(p[-4]==4)putchar(66);mz80_heap_init(arena,64);p=malloc(8);p[-4]=254;p[-3]=127;if(mz80_heap_check()==0)putchar(67);if(p[-3]==127)putchar(68);return 0;}', abi
  )).toBe("ABCD");
});

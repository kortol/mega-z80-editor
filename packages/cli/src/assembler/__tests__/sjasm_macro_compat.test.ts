import fs from "fs";
import os from "os";
import path from "path";
import { createLogger } from "../../logger";
import { assemble } from "../../cli/mz80-as";
import { assembleSource, assembleSourceMulti, getBytes, phaseEmit } from "../testUtils";

describe("sjasm macro compatibility", () => {
  it("expands a bare no-arg macro invocation used as a standalone source line", () => {
    const src = `
testname macro
  db "full"
endm

db "Z80 "
testname
db " test",0
`;

    const ctx = assembleSource(phaseEmit, src, {});
    expect(ctx.errors).toEqual([]);
    expect(getBytes(ctx)).toEqual([
      ...Buffer.from("Z80 full test", "ascii"),
      0x00,
    ]);
  });

  it("expands sjasm-style flags macro with nested macro invocation", () => {
    const src = `
db8 macro b7,b6,b5,b4,b3,b2,b1,b0
  db (b7<<7)|(b6<<6)|(b5<<5)|(b4<<4)|(b3<<3)|(b2<<2)|(b1<<1)|b0
endm

maskflags equ 0

flags macro sn,s,zn,z,f5n,f5,hcn,hc,f3n,f3,pvn,pv,nn,n,cn,c
  if maskflags
    db8 s,z,f5,hc,f3,pv,n,c
  else
    db 0xff
  endif
endm

flags s,1,z,1,f5,0,hc,1,f3,0,pv,1,n,1,c,1
`;

    const ctx = assembleSource(phaseEmit, src, {});
    expect(ctx.errors).toEqual([]);
    expect(getBytes(ctx)).toEqual([0xff]);
  });

  it("expands sjasm-style string macro used by z80test", () => {
    const src = `
name macro n
  dz n
endm

name "SELF TEST"
`;

    const ctx = assembleSource(phaseEmit, src, {});
    expect(ctx.errors).toEqual([]);
    expect(getBytes(ctx)).toEqual([
      ...Buffer.from("SELF TEST", "ascii"),
      0x00,
    ]);
  });

  it("accepts sjasm-style macro parameter names ending with '?'", () => {
    const src = `
testval macro arg1?, arg2?
  db arg1?
  db arg2?
endm

testval 'A', 'B'
`;

    const ctx = assembleSource(phaseEmit, src, {});
    expect(ctx.errors).toEqual([]);
    expect(getBytes(ctx)).toEqual([0x41, 0x42]);
  });

  it("expands a macro defined in the parent file and invoked from an included file", () => {
    const ctx = assembleSourceMulti(phaseEmit, {
      "main.asm": `
testname macro
  db "full"
endm

include "body.inc"
`,
      "body.inc": `
db "Z80 "
testname
db " test",0
`,
    }, {});

    expect(ctx.errors).toEqual([]);
    expect(getBytes(ctx)).toEqual([
      ...Buffer.from("Z80 full test", "ascii"),
      0x00,
    ]);
  });

  it("matches sjasmplus end_in_if_dup_macro_include fixture bytes", () => {
    const fixtureDir = path.resolve(
      __dirname,
      "../../../../../tools/sjasmplus/tests/macros",
    );
    const inputFile = path.join(fixtureDir, "end_in_if_dup_macro_include.asm");
    const expected = Array.from(
      fs.readFileSync(path.join(fixtureDir, "end_in_if_dup_macro_include.bin")),
    );
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-sjasm-fixture-"));
    const outFile = path.join(outDir, "fixture.rel");

    try {
      const ctx = assemble(createLogger("quiet"), inputFile, outFile, { relVersion: 2 });
      const actual = (ctx.texts ?? []).flatMap((t) => t.data);
      expect(ctx.errors).toEqual([]);
      expect(actual).toEqual(expected);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("matches sjasmplus Issue45_arg_substitution fixture bytes", () => {
    const fixtureDir = path.resolve(
      __dirname,
      "../../../../../tools/sjasmplus/tests/macros",
    );
    const inputFile = path.join(fixtureDir, "Issue45_arg_substitution.asm");
    const expected = Array.from(
      fs.readFileSync(path.join(fixtureDir, "Issue45_arg_substitution.bin")),
    );
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-sjasm-fixture-"));
    const outFile = path.join(outDir, "fixture.rel");

    try {
      const ctx = assemble(createLogger("quiet"), inputFile, outFile, { relVersion: 2 });
      const actual = (ctx.texts ?? []).flatMap((t) => t.data);
      expect(ctx.errors).toEqual([]);
      expect(actual).toEqual(expected);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("matches sjasmplus Issue45B_arg_substitution fixture bytes", () => {
    const fixtureDir = path.resolve(
      __dirname,
      "../../../../../tools/sjasmplus/tests/macros",
    );
    const inputFile = path.join(fixtureDir, "Issue45B_arg_substitution.asm");
    const expected = Array.from(
      fs.readFileSync(path.join(fixtureDir, "Issue45B_arg_substitution.bin")),
    );
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-sjasm-fixture-"));
    const outFile = path.join(outDir, "fixture.rel");

    try {
      const ctx = assemble(createLogger("quiet"), inputFile, outFile, { relVersion: 2 });
      const actual = (ctx.texts ?? []).flatMap((t) => t.data);
      expect(ctx.errors).toEqual([]);
      expect(actual).toEqual(expected);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});

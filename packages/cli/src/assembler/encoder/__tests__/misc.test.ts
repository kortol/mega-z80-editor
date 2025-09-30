import { AsmContext } from "../../context";
import { NodeInstr } from "../../parser";
import { encodeInstr } from "../../encoder";

function makeCtx(): AsmContext {
  return {
    loc: 0,
    moduleName: "TEST",
    symbols: new Map(),
    unresolved: [],
    modeWord32: false,
    modeSymLen: 6,
    caseInsensitive: true,
    texts: [],
    errors: [],
  };
}

function makeNode(op: string, args: string[], line = 1): NodeInstr {
  return { kind: "instr", op, args, line };
}

describe("Misc", () => {
  test("NOP → 00", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("NOP", []));
    expect(ctx.texts[0].data).toEqual([0x00]);
  });

  test("HALT → 76", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("HALT", []));
    expect(ctx.texts[0].data).toEqual([0x76]);
  });

  test("DAA → 27", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DAA", []));
    expect(ctx.texts[0].data).toEqual([0x27]);
  });

  test("CPL → 2F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CPL", []));
    expect(ctx.texts[0].data).toEqual([0x2f]);
  });

  test("SCF → 37", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SCF", []));
    expect(ctx.texts[0].data).toEqual([0x37]);
  });

  test("CCF → 3F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CCF", []));
    expect(ctx.texts[0].data).toEqual([0x3f]);
  });

  test("DI → F3", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DI", []));
    expect(ctx.texts[0].data).toEqual([0xf3]);
  });

  test("EI → FB", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EI", []));
    expect(ctx.texts[0].data).toEqual([0xfb]);
  });

  test("RLCA → 07", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RLCA", []));
    expect(ctx.texts[0].data).toEqual([0x07]);
  });

  test("RRCA → 0F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RRCA", []));
    expect(ctx.texts[0].data).toEqual([0x0f]);
  });

  test("RLA → 17", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RLA", []));
    expect(ctx.texts[0].data).toEqual([0x17]);
  });

  test("RRA → 1F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RRA", []));
    expect(ctx.texts[0].data).toEqual([0x1f]);
  });
});

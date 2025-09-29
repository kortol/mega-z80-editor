import { AsmContext } from "../context";
import { NodeInstr } from "../parser";
import { encodeInstr } from "../encoder";

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
  };
}

function makeNode(op: string, args: string[], line = 1): NodeInstr {
  return { kind: "instr", op, args, line };
}


describe("LD instructions", () => {
  test("LD A,B → 78", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "B"]));
    expect(ctx.texts[0].data).toEqual([0x78]);
  });

  test("LD B,A → 47", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["B", "A"]));
    expect(ctx.texts[0].data).toEqual([0x47]);
  });

  test("LD A,1 → 3E 01", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "1"]));
    expect(ctx.texts[0].data).toEqual([0x3e, 0x01]);
  });

  test("LD A,'A' → 3E 41", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "65"])); // tokenizerが 'A' → 65 に変換
    expect(ctx.texts[0].data).toEqual([0x3e, 0x41]);
  });

  test("LD A,'#' → 3E 23", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "35"])); // '#' = 35
    expect(ctx.texts[0].data).toEqual([0x3e, 0x23]);
  });

  test("LD A,(HL) → 7E", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "(HL)"]));
    expect(ctx.texts[0].data).toEqual([0x7e]);
  });

  test("LD (HL),A → 77", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(HL)", "A"]));
    expect(ctx.texts[0].data).toEqual([0x77]);
  });

  test("LD A,(1234H) → 3A 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0x3a, 0x34, 0x12]);
  });

  test("LD (1234H),A → 32 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["1234H", "A"]));
    expect(ctx.texts[0].data).toEqual([0x32, 0x34, 0x12]);
  });
});

describe("LD 8bit (basic)", () => {
  test("LD A,(HL) → 7E", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "(HL)"]));
    expect(ctx.texts[0].data).toEqual([0x7e]);
  });

  test("LD (HL),A → 77", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(HL)", "A"]));
    expect(ctx.texts[0].data).toEqual([0x77]);
  });

  test("LD A,(1234H) → 3A 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0x3a, 0x34, 0x12]);
  });

  test("LD (1234H),A → 32 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["1234H", "A"]));
    expect(ctx.texts[0].data).toEqual([0x32, 0x34, 0x12]);
  });
});

describe("LD 16bit", () => {
  test("LD HL,1234H → 21 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["HL", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0x21, 0x34, 0x12]);
  });

  test("LD DE,5678H → 11 78 56", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["DE", "5678H"]));
    expect(ctx.texts[0].data).toEqual([0x11, 0x78, 0x56]);
  });

  test("LD (1234H),HL → 22 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(1234H)", "HL"]));
    expect(ctx.texts[0].data).toEqual([0x22, 0x34, 0x12]);
  });

  test("LD HL,(1234H) → 2A 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["HL", "(1234H)"]));
    expect(ctx.texts[0].data).toEqual([0x2a, 0x34, 0x12]);
  });

  test("LD SP,HL → F9", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["SP", "HL"]));
    expect(ctx.texts[0].data).toEqual([0xf9]);
  });
});

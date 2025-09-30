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

describe("Arithmetic and Logic", () => {
  test("ADD A,B → 80", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["A", "B"]));
    expect(ctx.texts[0].data).toEqual([0x80]);
  });

  test("ADD A,1 → C6 01", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["A", "1"]));
    expect(ctx.texts[0].data).toEqual([0xc6, 0x01]);
  });

  test("SUB B → 90", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("SUB", ["B"]));
    expect(ctx.texts[0].data).toEqual([0x90]);
  });

  test("AND C → A1", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("AND", ["C"]));
    expect(ctx.texts[0].data).toEqual([0xa1]);
  });

  test("OR D → B2", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("OR", ["D"]));
    expect(ctx.texts[0].data).toEqual([0xb2]);
  });

  test("XOR E → AB", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("XOR", ["E"]));
    expect(ctx.texts[0].data).toEqual([0xab]);
  });

  test("CP 1 → FE 01", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CP", ["1"]));
    expect(ctx.texts[0].data).toEqual([0xfe, 0x01]);
  });

  test("INC A → 3C", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["A"]));
    expect(ctx.texts[0].data).toEqual([0x3c]);
  });

  test("DEC B → 05", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DEC", ["B"]));
    expect(ctx.texts[0].data).toEqual([0x05]);
  });
});

// --- 16bit Arithmetic (non-ED) ---
describe("16bit Arithmetic", () => {
  test("ADD HL,BC → 09", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["HL", "BC"]));
    expect(ctx.texts[0].data).toEqual([0x09]);
  });

  test("ADD HL,DE → 19", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["HL", "DE"]));
    expect(ctx.texts[0].data).toEqual([0x19]);
  });

  test("ADD HL,HL → 29", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["HL", "HL"]));
    expect(ctx.texts[0].data).toEqual([0x29]);
  });

  test("ADD HL,SP → 39", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["HL", "SP"]));
    expect(ctx.texts[0].data).toEqual([0x39]);
  });
});

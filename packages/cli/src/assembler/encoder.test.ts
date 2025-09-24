import { AsmContext } from "./context";
import { NodeInstr } from "./parser";
import { encodeInstr } from "./encoder";

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

describe("encoder", () => {
  test("LD A,1 → 3E 01", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "1"]));
    expect(ctx.texts[0].data).toEqual([0x3E, 0x01]);
  });

  test("LD A,'A' → 3E 41", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "65"])); // tokenizerが 'A' → 65 に変換
    expect(ctx.texts[0].data).toEqual([0x3E, 0x41]);
  });

  test("LD A,'#' → 3E 23", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "35"])); // '#' = 35
    expect(ctx.texts[0].data).toEqual([0x3E, 0x23]);
  });

  test("LD B,A → 47", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["B", "A"]));
    expect(ctx.texts[0].data).toEqual([0x47]);
  });

  test("CALL 1234 → CD 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CALL", ["1234"]));
    expect(ctx.texts[0].data).toEqual([0xCD, 0xD2, 0x04]);
  });

  test("CALL BDOS → unresolved", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CALL", ["BDOS"]));
    expect(ctx.texts[0].data).toEqual([0xCD, 0x00, 0x00]);
    expect(ctx.unresolved).toEqual([
      { addr: 1, symbol: "BDOS", size: 2 }
    ]);
  });

  test("JR forward offset", () => {
    const ctx = makeCtx();
    // loc = 0 の状態で "JR 10" は → offset = 10 - (0+2) = 8
    encodeInstr(ctx, makeNode("JR", ["10"]));
    expect(ctx.texts[0].data).toEqual([0x18, 0x08]);
  });

  test("JR backward offset", () => {
    const ctx = makeCtx();
    ctx.loc = 0x20;
    // "JR 0x10" → offset = 0x10 - (0x20+2) = -0x12 (signed)
    encodeInstr(ctx, makeNode("JR", ["16"]));
    expect(ctx.texts[0].data).toEqual([0x18, 0xEE]); // -18 = 0xEE
  });

  test("unsupported LD form → error", () => {
    const ctx = makeCtx();
    expect(() => encodeInstr(ctx, makeNode("LD", ["(HL)", "A"])))
      .toThrow(/Unsupported LD/);
  });
});

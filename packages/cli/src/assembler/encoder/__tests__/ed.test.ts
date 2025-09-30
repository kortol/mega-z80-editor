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
  };
}

function makeNode(op: string, args: string[], line = 1): NodeInstr {
  return { kind: "instr", op, args, line };
}

describe("ED prefix", () => {
  test("LDI → ED A0", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LDI", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xa0]);
  });

  test("LDIR → ED B0", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LDIR", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xb0]);
  });

  // --- I/R レジスタ ---
  test("LD A,I → ED 57", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "I"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x57]);
  });

  test("LD I,A → ED 47", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["I", "A"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x47]);
  });

  test("LD A,R → ED 5F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "R"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x5F]);
  });

  test("LD R,A → ED 4F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["R", "A"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x4F]);
  });

  // --- 割り込み制御 ---
  test("RETN → ED 45", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RETN", []));
    expect(ctx.texts[0].data).toEqual([0xED, 0x45]);
  });

  test("RETI → ED 4D", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RETI", []));
    expect(ctx.texts[0].data).toEqual([0xED, 0x4D]);
  });

  test("IM 0 → ED 46", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("IM", ["0"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x46]);
  });

  test("IM 1 → ED 56", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("IM", ["1"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x56]);
  });

  test("IM 2 → ED 5E", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("IM", ["2"]));
    expect(ctx.texts[0].data).toEqual([0xED, 0x5E]);
  });
});

describe("ED prefix (misc)", () => {
  test("NEG → ED 44", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("NEG", []));
    expect(ctx.texts[0].data).toEqual([0xED, 0x44]);
  });

  test("RRD → ED 67", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RRD", []));
    expect(ctx.texts[0].data).toEqual([0xED, 0x67]);
  });

  test("RLD → ED 6F", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("RLD", []));
    expect(ctx.texts[0].data).toEqual([0xED, 0x6F]);
  });
});

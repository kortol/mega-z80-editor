import { AsmContext, createContext, SourcePos } from "../../context";
import { NodeInstr } from "../../parser";
import { encodeInstr } from "../../encoder";
import { initCodegen } from "../../codegen/emit";

function makeCtx(): AsmContext {
  const ctx = createContext({ moduleName: "TEST" });
  initCodegen(ctx, { withDefaultSections: true });
  return ctx;
}

function makeNode(op: string, args: string[], pos: SourcePos = { line: 1, file: "test.asm", phase: "analyze" }): NodeInstr {
  return { kind: "instr", op, args, pos };
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

  test("CPI/CPIR/CPD/CPDR", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("CPI", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xa1]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("CPIR", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xb1]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("CPD", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xa9]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("CPDR", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xb9]);
  });

  test("INI/INIR/IND/INDR", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INI", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xa2]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("INIR", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xb2]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("IND", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xaa]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("INDR", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xba]);
  });

  test("OUTI/OTIR/OUTD/OTDR", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("OUTI", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xa3]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("OTIR", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xb3]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("OUTD", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xab]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("OTDR", []));
    expect(ctx.texts[0].data).toEqual([0xed, 0xbb]);
  });
});

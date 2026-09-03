import { AsmContext, createContext, SourcePos } from "../../context";
import { NodeInstr } from "../../node";
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
    encodeInstr(ctx, makeNode("LD", ["A", "(1234H)"]));
    expect(ctx.texts[0].data).toEqual([0x3a, 0x34, 0x12]);
  });

  test("LD (1234H),A → 32 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(1234H)", "A"]));
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
    encodeInstr(ctx, makeNode("LD", ["A", "(1234H)"]));
    expect(ctx.texts[0].data).toEqual([0x3a, 0x34, 0x12]);
  });

  test("LD (1234H),A → 32 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(1234H)", "A"]));
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

describe("LD extra", () => {
  test("LD A,(BC)/(DE) and (BC)/(DE),A", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "(BC)"]));
    expect(ctx.texts[0].data).toEqual([0x0a]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("LD", ["A", "(DE)"]));
    expect(ctx.texts[0].data).toEqual([0x1a]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("LD", ["(BC)", "A"]));
    expect(ctx.texts[0].data).toEqual([0x02]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("LD", ["(DE)", "A"]));
    expect(ctx.texts[0].data).toEqual([0x12]);
  });

  test("LD (IX+d),n", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(IX+1)", "7"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x36, 0x01, 0x07]);
  });

  test("LD IXH,1 and LD A,IXL", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["IXH", "1"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x26, 0x01]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("LD", ["A", "IXL"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x7d]);
  });

  test("LD IX/IY,(nn) and LD (nn),IX/IY", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["IX", "(1234H)"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x2a, 0x34, 0x12]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("LD", ["IY", "(1234H)"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0x2a, 0x34, 0x12]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("LD", ["(1234H)", "IX"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x22, 0x34, 0x12]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("LD", ["(1234H)", "IY"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0x22, 0x34, 0x12]);
  });

  test("LD IXH,(IX+1) and LD (IY-2),IYL", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["IXH", "(IX+1)"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x66, 0x01]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("LD", ["(IY-2)", "IYL"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0x75, 0xfe]);
  });

  test("LD (1234H),(HL) is rejected", () => {
    const ctx = makeCtx();
    expect(() => encodeInstr(ctx, makeNode("LD", ["(1234H)", "(HL)"]))).toThrow(
      /memory-to-memory/
    );
  });

  test("LD (IX+1),(IY+2) is rejected", () => {
    const ctx = makeCtx();
    expect(() => encodeInstr(ctx, makeNode("LD", ["(IX+1)", "(IY+2)"]))).toThrow(
      /Unsupported LD form/
    );
  });
});

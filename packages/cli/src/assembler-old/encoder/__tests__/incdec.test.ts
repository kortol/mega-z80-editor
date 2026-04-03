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

describe("INC/DEC instructions", () => {
  test("INC B → 04", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["B"]));
    expect(ctx.texts[0].data).toEqual([0x04]);
  });

  test("DEC L → 2D", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DEC", ["L"]));
    expect(ctx.texts[0].data).toEqual([0x2d]);
  });
});

// --- 16bit Arithmetic (non-ED) ---
describe("16 bit INC/DEC instructions", () => {
  test("INC BC → 03", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["BC"]));
    expect(ctx.texts[0].data).toEqual([0x03]);
  });

  test("INC DE → 13", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["DE"]));
    expect(ctx.texts[0].data).toEqual([0x13]);
  });

  test("INC HL → 23", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["HL"]));
    expect(ctx.texts[0].data).toEqual([0x23]);
  });

  test("INC SP → 33", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["SP"]));
    expect(ctx.texts[0].data).toEqual([0x33]);
  });

  test("DEC BC → 0B", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DEC", ["BC"]));
    expect(ctx.texts[0].data).toEqual([0x0b]);
  });

  test("DEC DE → 1B", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DEC", ["DE"]));
    expect(ctx.texts[0].data).toEqual([0x1b]);
  });

  test("DEC HL → 2B", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DEC", ["HL"]));
    expect(ctx.texts[0].data).toEqual([0x2b]);
  });

  test("DEC SP → 3B", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("DEC", ["SP"]));
    expect(ctx.texts[0].data).toEqual([0x3b]);
  });
});

describe("INC/DEC extra", () => {
  test("INC/DEC (HL)", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["(HL)"]));
    expect(ctx.texts[0].data).toEqual([0x34]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("DEC", ["(HL)"]));
    expect(ctx.texts[0].data).toEqual([0x35]);
  });

  test("INC/DEC IX/IY", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["IX"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x23]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("DEC", ["IY"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0x2b]);
  });

  test("INC/DEC (IX/IY+d)", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["(IX+1)"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x34, 0x01]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("DEC", ["(IY-2)"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0x35, 0xfe]);
  });

  test("INC IXH", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("INC", ["IXH"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x24]);
  });
});

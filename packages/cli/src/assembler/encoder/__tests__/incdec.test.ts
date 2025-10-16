import { AsmContext, createContext } from "../../context";
import { NodeInstr } from "../../parser";
import { encodeInstr } from "../../encoder";
import { initCodegen } from "../../codegen/emit";

function makeCtx(): AsmContext {
  const ctx = createContext({ moduleName: "TEST" });
  initCodegen(ctx, { withDefaultSections: true });
  return ctx;
}


function makeNode(op: string, args: string[], line = 1, file = "test.asm"): NodeInstr {
  return { kind: "instr", op, args, line, file };
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

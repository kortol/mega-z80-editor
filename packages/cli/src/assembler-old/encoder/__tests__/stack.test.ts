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

describe("PUSH/POP instructions", () => {
  test("PUSH/POP BC", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("PUSH", ["BC"]));
    expect(ctx.texts[0].data).toEqual([0xc5]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("POP", ["BC"]));
    expect(ctx.texts[0].data).toEqual([0xc1]);
  });

  test("PUSH/POP AF", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("PUSH", ["AF"]));
    expect(ctx.texts[0].data).toEqual([0xf5]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("POP", ["AF"]));
    expect(ctx.texts[0].data).toEqual([0xf1]);
  });

  test("PUSH/POP IX", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("PUSH", ["IX"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0xe5]);
    ctx.texts = [];
    encodeInstr(ctx, makeNode("POP", ["IX"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0xe1]);
  });
});

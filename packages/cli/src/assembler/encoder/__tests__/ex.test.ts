import { AsmContext, createContext } from "../../context";
import { NodeInstr } from "../../parser";
import { encodeInstr } from "../../encoder";
import { initCodegen } from "../../codegen/emit";

function makeCtx(): AsmContext {
  const ctx = createContext({ moduleName: "TEST" });
  initCodegen(ctx, { withDefaultSections: true });
  return ctx;
}


function makeNode(op: string, args: string[], line = 1): NodeInstr {
  return { kind: "instr", op, args, line };
}

describe("EX/EXX encodeInstr", () => {
  it("EX AF,AF' → 08", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EX", ["AF", "AF'"]));
    expect(ctx.texts[0].data).toEqual([0x08]);
  });

  it("EX DE,HL → EB", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EX", ["DE", "HL"]));
    expect(ctx.texts[0].data).toEqual([0xeb]);
  });

  it("EX (SP),HL → E3", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EX", ["(SP)", "HL"]));
    expect(ctx.texts[0].data).toEqual([0xe3]);
  });

  it("EX (SP),IX → DD E3", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EX", ["(SP)", "IX"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0xe3]);
  });

  it("EX (SP),IY → FD E3", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EX", ["(SP)", "IY"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0xe3]);
  });

  it("EXX → D9", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("EXX", []));
    expect(ctx.texts[0].data).toEqual([0xd9]);
  });
});

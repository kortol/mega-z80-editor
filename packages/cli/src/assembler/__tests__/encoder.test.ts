import { AsmContext, createContext } from "../context";
import { NodeInstr } from "../parser";
import { encodeInstr } from "../encoder";
import { initCodegen } from "../codegen/emit";

function makeCtx(): AsmContext {
  const ctx = createContext({ moduleName: "TEST" });
  initCodegen(ctx, { withDefaultSections: true });
  return ctx;
}

function makeNode(op: string, args: string[], line = 1, file = "test.asm"): NodeInstr {
  return { kind: "instr", op, args, line, file };
}

describe("encoder", () => {
  test("unsupported LD form → error", () => {
    const ctx = makeCtx();
    expect(() => encodeInstr(ctx, makeNode("LD", ["HL", "A"]))).toThrow(
      /Unsupported LD/
    );
  });

  test("unsupported instruction → error", () => {
    const ctx = makeCtx();
    expect(() => encodeInstr(ctx, makeNode("FOOBART", []))).toThrow(
      /Unsupported instruction FOOBAR/
    );
  });
});

describe("DD/FD prefix", () => {
  test("LD IX,1234H → DD 21 34 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["IX", "1234H"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x21, 0x34, 0x12]);
  });

  test("LD IY,5678H → FD 21 78 56", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["IY", "5678H"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0x21, 0x78, 0x56]);
  });

  test("ADD IX,BC → DD 09", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["IX", "BC"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x09]);
  });

  test("ADD IY,SP → FD 39", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("ADD", ["IY", "SP"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0x39]);
  });

  test("LD (IX+01H),A → DD 77 01", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["(IX+01H)", "A"]));
    expect(ctx.texts[0].data).toEqual([0xdd, 0x77, 0x01]);
  });

  test("LD A,(IY+02H) → FD 7E 02", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("LD", ["A", "(IY+02H)"]));
    expect(ctx.texts[0].data).toEqual([0xfd, 0x7e, 0x02]);
  });
});

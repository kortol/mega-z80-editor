import { AsmContext, createContext, SourcePos } from "../../context";
import { NodeInstr } from "../../parser";
import { encodeInstr } from "../../encoder";
import { initCodegen } from "../../codegen/emit";

function makeCtx(): AsmContext {
  const ctx = createContext({ moduleName: "TEST" });
  initCodegen(ctx, { withDefaultSections: true });
  return ctx;
}


function makeNode(op: string, args: string[], pos: SourcePos = { line: 1, file: "test.asm" }): NodeInstr {
  return { kind: "instr", op, args, pos };
}

describe("IO instructions", () => {
  test("IN A,(12H) → DB 12", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("IN", ["A", "(12H)"]));
    expect(ctx.texts[0].data).toEqual([0xdb, 0x12]);
  });

  test("OUT (34H),A → D3 34", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("OUT", ["(34H)", "A"]));
    expect(ctx.texts[0].data).toEqual([0xd3, 0x34]);
  });

  test("IN B,(C) → ED 40", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("IN", ["B", "(C)"]));
    expect(ctx.texts[0].data).toEqual([0xed, 0x40]);
  });

  test("OUT (C),D → ED 51", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("OUT", ["(C)", "D"]));
    expect(ctx.texts[0].data).toEqual([0xed, 0x51]);
  });

  test("IN (C) → ED 70", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("IN", ["(C)"]));
    expect(ctx.texts[0].data).toEqual([0xed, 0x70]);
  });

  test("IN F,(C) → ED 70", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("IN", ["F", "(C)"]));
    expect(ctx.texts[0].data).toEqual([0xed, 0x70]);
  });

  test("OUT (C),0 → ED 71", () => {
    const ctx = makeCtx();
    encodeInstr(ctx, makeNode("OUT", ["(C)", "0"]));
    expect(ctx.texts[0].data).toEqual([0xed, 0x71]);
  });
});

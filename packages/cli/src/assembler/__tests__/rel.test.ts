import { AsmContext } from "../context";
import { emitRel } from "../rel";

function makeCtx(): AsmContext {
  return {
    loc: 0,
    moduleName: "HELLO",
    symbols: new Map(),
    unresolved: [],
    modeWord32: false,
    modeSymLen: 6,
    caseInsensitive: true,
    texts: [],
    endReached: false,
    errors: [],
  };
}

describe("rel emitter", () => {
  test("minimal H record only", () => {
    const ctx = makeCtx();
    const rel = emitRel(ctx);
    expect(rel).toBe("H HELLO");
  });

  test("T record with data", () => {
    const ctx = makeCtx();
    ctx.texts.push({ addr: 0x0100, data: [0x3E, 0x41] }); // LD A,'A'
    const rel = emitRel(ctx).split("\n");
    expect(rel).toContain("H HELLO");
    expect(rel).toContain("T 0100 3E 41");
  });

  test("S record with symbol", () => {
    const ctx = makeCtx();
    ctx.symbols.set("FOO", 0x1234);
    const rel = emitRel(ctx).split("\n");
    expect(rel).toContain("S FOO 1234");
  });

  test("R record unresolved", () => {
    const ctx = makeCtx();
    ctx.unresolved.push({ addr: 0x0200, symbol: "BDOS", size: 2 });
    const rel = emitRel(ctx).split("\n");
    expect(rel).toContain("R 0200 BDOS");
  });

  test("E record entry", () => {
    const ctx = makeCtx();
    ctx.entry = 0x0100;
    const rel = emitRel(ctx).split("\n");
    expect(rel).toContain("E 0100");
  });

  test("combined case", () => {
    const ctx = makeCtx();
    ctx.texts.push({ addr: 0x0000, data: [0xCD, 0x05, 0x00] }); // CALL 0005h
    ctx.symbols.set("START", 0x0000);
    ctx.unresolved.push({ addr: 0x0001, symbol: "BDOS", size: 2 });
    ctx.entry = 0x0000;

    const rel = emitRel(ctx).split("\n");
    expect(rel).toContain("H HELLO");
    expect(rel).toContain("T 0000 CD 05 00");
    expect(rel).toContain("S START 0000");
    expect(rel).toContain("R 0001 BDOS");
    expect(rel).toContain("E 0000");
  });
});

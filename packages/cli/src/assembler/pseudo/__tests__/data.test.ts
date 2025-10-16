import { AsmContext, createContext } from "../../context";
import { NodePseudo } from "../../parser";
import { handlePseudo } from "../../pseudo";
import * as extern from "../../expr/parseExternExpr";
import { initCodegen } from "../../codegen/emit";

function makeCtx(): AsmContext {
  const ctx = createContext({ moduleName: "TEST" });
  initCodegen(ctx, { withDefaultSections: true });
  ctx.phase = "emit"; // 未解決シンボル登録を有効化
  return ctx;
}


function makeNode(op: string, args: string[] = [], line = 1, file = "test.asm"): NodePseudo {
  return { kind: "pseudo", op, args: args.map(arg => ({ value: arg })), line, file };
}

describe("pseudo - DB/DW", () => {
  test("DB with numeric list", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DB", ["1", "2", "3"]));
    expect(ctx.texts[0].data).toEqual([1, 2, 3]);
  });

  test("DB with char literal", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DB", ["'A'"]));
    expect(ctx.texts[0].data).toEqual([0x41]);
  });

  test("DB with string literal", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode('DB', ['"ABC"']));
    expect(ctx.texts[0].data).toEqual([0x41, 0x42, 0x43]);
  });

  test("DB with mixed args", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DB", ["'A'", '"BC"', "5"]));
    expect(ctx.texts[0].data).toEqual([0x41, 0x42, 0x43, 5]);
  });

  test("DW with numeric value", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DW", ["1234H"]));
    expect(ctx.texts[0].data).toEqual([0x34, 0x12]);
  });

  test("DW with char literal", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DW", ["'A'"]));
    expect(ctx.texts[0].data).toEqual([0x41, 0x00]);
  });

  test("DW with string literal (error)", () => {
    const ctx = makeCtx();
    expect(() =>
      handlePseudo(ctx, makeNode("DW", ['"AB"']))
    ).toThrow(/does not support/i);
  });

  test("DW with numeric list", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DW", ["1", "2", "3"]));
    expect(ctx.texts[0].data).toEqual([1, 0, 2, 0, 3, 0]);
  });

  // 🧩 NEW: DS（Define Storage）
  test("DS allocates zero-filled bytes", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode("DS", ["8"]));
    const sec = ctx.sections.get(ctx.currentSection)!;
    expect(sec.bytes.length).toBe(8);
    expect(sec.bytes.every(b => b === 0)).toBe(true);
    expect(ctx.texts[0].data).toEqual(new Array(8).fill(0));
    expect(sec.lc).toBe(8);
  });

  // 🧩 NEW: 未解決シンボル（EXTERN式）
  test("DB with external symbol registers unresolved", () => {
    const ctx = makeCtx();

    // 🔹 parseExternExprをスタブ化して、外部参照と認識させる
    jest.spyOn(extern, "parseExternExpr").mockReturnValue({
      symbol: "EXT",
      addend: 1,
    });

    // 擬似的にparseExternExprが "EXT+1" のような形式を認識する前提
    handlePseudo(ctx, makeNode("DB", ["EXT+1"]));

    console.log(ctx);

    expect(ctx.unresolved.length).toBe(1);
    const u = ctx.unresolved[0];
    expect(u.symbol).toBe("EXT");
    expect(u.addend).toBe(1);
    expect(u.size).toBe(1);
    expect(ctx.texts[0].data).toEqual([0x00]); // 仮データ
  });

  test("DW with external symbol registers unresolved", () => {
    const ctx = makeCtx();

    // 🔹 parseExternExprをスタブ化
    jest.spyOn(extern, "parseExternExpr").mockReturnValue({
      symbol: "EXT",
      addend: 0,
    });

    handlePseudo(ctx, makeNode("DW", ["EXT"]));

    expect(ctx.unresolved.length).toBe(1);
    const u = ctx.unresolved[0];
    expect(u.symbol).toBe("EXT");
    expect(u.size).toBe(2);
    expect(u.addend).toBe(0);

    // 仮データが [00, 00]
    expect(ctx.texts[0].data).toEqual([0x00, 0x00]);
  });

  test("DS EXT1-$ registers unresolved (future support)", () => {
    const ctx = makeCtx();

    jest.spyOn(extern, "parseExternExpr").mockReturnValue({
      symbol: "EXT1",
      addend: 0,
    });

    handlePseudo(ctx, makeNode("DS", ["EXT1-$"]));

    expect(ctx.unresolved.length).toBe(1);
    const u = ctx.unresolved[0];
    expect(u.symbol).toBe("EXT1");
    expect(u.size).toBe(0); // DS は実データ生成しない
  });

  test(".WORD32 with no operand sets flag", () => {
    const ctx = makeCtx();
    handlePseudo(ctx, makeNode(".WORD32", []));
    expect(ctx.modeWord32).toBe(true);
  });

  test(".WORD32 with operand throws", () => {
    const ctx = makeCtx();
    expect(() => handlePseudo(ctx, makeNode(".WORD32", ["100H"])))
      .toThrow(/does not take operands/);
  });
});

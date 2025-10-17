import {
  initCodegen,
  emitBytes,
  emitWord,
  emitFixup,
  emitSection,
  emitGap,
  emitAlign,
  getLC,
  setLC,
} from "../emit";
import { AsmContext, createContext, RequesterInfo, SourcePos } from "../../context";

describe("emit.ts 基本動作テスト", () => {
  let ctx: AsmContext;

  beforeEach(() => {
    ctx = createContext();
    initCodegen(ctx, { withDefaultSections: true });
  });

  test("initCodegenでデフォルトTEXTセクションが作成される", () => {
    expect(ctx.sections.size).toBe(1);
    const text = ctx.sections.get(0)!;
    expect(text.name).toBe(".text");
    expect(text.lc).toBe(0);
    expect(ctx.currentSection).toBe(0);
  });

  test("emitBytesでバイト列が出力され、LCとtextsが更新される", () => {
    emitBytes(ctx, [0x3E, 0x00], { line: 0, file: "test.asm" });
    const text = ctx.sections.get(0)!;
    expect(text.bytes).toEqual([0x3E, 0x00]);
    expect(text.lc).toBe(2);
    expect(ctx.texts[0]).toEqual(
      expect.objectContaining({ data: [0x3E, 0x00], addr: 0, sectionId: 0 })
    );
  });

  test("emitWordで16bit値が小端で出力される", () => {
    emitWord(ctx, 0x1234, { line: 0, file: "test.asm" });
    const text = ctx.sections.get(0)!;
    expect(text.bytes).toEqual([0x34, 0x12]);
  });

  test("emitFixupで未解決シンボルが登録され、仮データが出力される", () => {
    const pos: SourcePos = { line: 0, file: "test.asm" };
    emitFixup(ctx, "EXTSYM", 2, { op: "DB", phase: "assemble", pos, }, 4, pos);
    const u = ctx.unresolved[0];
    expect(u.symbol).toBe("EXTSYM");
    expect(u.size).toBe(2);
    expect(u.addend).toBe(4);
    expect(ctx.sections.get(0)!.bytes.length).toBe(2);
  });

  test("emitSectionでDATAセクションを新規作成できる", () => {
    emitSection(ctx, "DATA");
    const sec = ctx.sections.get(1)!;
    expect(sec.name).toBe(".data");
    expect(sec.kind).toBe("DATA");
    expect(ctx.currentSection).toBe(1);
  });

  test("emitSectionで既存セクションに戻るとLCが維持される", () => {
    // TEXTに2バイト出力
    emitBytes(ctx, [0x3E, 0x00], { line: 0, file: "test.asm" });
    expect(getLC(ctx)).toBe(2);

    // DATAセクション作成
    emitSection(ctx, "DATA");
    emitBytes(ctx, [0x11, 0x22], { line: 0, file: "test.asm" });
    expect(getLC(ctx)).toBe(2);

    // TEXTに戻る
    emitSection(ctx, "TEXT");
    expect(ctx.currentSection).toBe(0);
    expect(getLC(ctx)).toBe(2); // 戻った時も続き
  });

  test("emitGapでゼロ埋めされ、LCが増える", () => {
    emitGap(ctx, 4, { line: 0, file: "test.asm" });
    const text = ctx.sections.get(0)!;
    expect(text.bytes).toEqual([0, 0, 0, 0]);
    expect(text.lc).toBe(4);
  });

  test("emitAlignで境界に揃えられる", () => {
    emitBytes(ctx, [0x01, 0x02, 0x03], { line: 0, file: "test.asm" });
    emitAlign(ctx, 4, { line: 0, file: "test.asm" });
    const text = ctx.sections.get(0)!;
    // 現在3 → 4バイト境界に揃うため +1ゼロが出力される
    expect(text.bytes.slice(-1)).toEqual([0x00]);
    expect(text.lc).toBe(4);
  });

  test("getLC / setLCでロケーションを取得・設定できる", () => {
    emitBytes(ctx, [1, 2, 3], { line: 0, file: "test.asm" });
    expect(getLC(ctx)).toBe(3);
    setLC(ctx, 10);
    expect(getLC(ctx)).toBe(10);
    expect(ctx.loc).toBe(10);
  });

  test("複数セクション間で個別のLCが保持される", () => {
    emitBytes(ctx, [1, 2, 3], { line: 0, file: "test.asm" });
    emitSection(ctx, "DATA");
    emitBytes(ctx, [0xAA], { line: 0, file: "test.asm" });
    expect(getLC(ctx)).toBe(1);
    emitSection(ctx, "TEXT");
    expect(getLC(ctx)).toBe(3);
  });
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const emit_1 = require("../emit");
const context_1 = require("../../context");
describe("emit.ts 基本動作テスト", () => {
    let ctx;
    beforeEach(() => {
        ctx = (0, context_1.createContext)();
        (0, emit_1.initCodegen)(ctx, { withDefaultSections: true });
    });
    test("initCodegenでデフォルトTEXTセクションが作成される", () => {
        expect(ctx.sections.size).toBe(1);
        const text = ctx.sections.get(0);
        expect(text.name).toBe(".text");
        expect(text.lc).toBe(0);
        expect(ctx.currentSection).toBe(0);
    });
    test("emitBytesでバイト列が出力され、LCとtextsが更新される", () => {
        (0, emit_1.emitBytes)(ctx, [0x3E, 0x00], { line: 0, file: "test.asm", phase: "emit" });
        const text = ctx.sections.get(0);
        expect(text.bytes).toEqual([0x3E, 0x00]);
        expect(text.lc).toBe(2);
        expect(ctx.texts[0]).toEqual(expect.objectContaining({ data: [0x3E, 0x00], addr: 0, sectionId: 0 }));
    });
    test("emitWordで16bit値が小端で出力される", () => {
        (0, emit_1.emitWord)(ctx, 0x1234, { line: 0, file: "test.asm", phase: "emit" });
        const text = ctx.sections.get(0);
        expect(text.bytes).toEqual([0x34, 0x12]);
    });
    test("emitFixupで未解決シンボルが登録され、仮データが出力される", () => {
        const pos = { line: 0, file: "test.asm", phase: "emit" };
        (0, emit_1.emitFixup)(ctx, "EXTSYM", 2, { op: "DB", phase: "assemble", pos, }, 4, pos);
        const u = ctx.unresolved[0];
        expect(u.symbol).toBe("EXTSYM");
        expect(u.size).toBe(2);
        expect(u.addend).toBe(4);
        expect(ctx.sections.get(0).bytes.length).toBe(2);
    });
    test("emitSectionでDATAセクションを新規作成できる", () => {
        (0, emit_1.emitSection)(ctx, "DATA");
        const sec = ctx.sections.get(1);
        expect(sec.name).toBe(".data");
        expect(sec.kind).toBe("DATA");
        expect(ctx.currentSection).toBe(1);
    });
    test("emitSectionで既存セクションに戻るとLCが維持される", () => {
        // TEXTに2バイト出力
        (0, emit_1.emitBytes)(ctx, [0x3E, 0x00], { line: 0, file: "test.asm", phase: "emit" });
        expect((0, emit_1.getLC)(ctx)).toBe(2);
        // DATAセクション作成
        (0, emit_1.emitSection)(ctx, "DATA");
        (0, emit_1.emitBytes)(ctx, [0x11, 0x22], { line: 0, file: "test.asm", phase: "emit" });
        expect((0, emit_1.getLC)(ctx)).toBe(2);
        // TEXTに戻る
        (0, emit_1.emitSection)(ctx, "TEXT");
        expect(ctx.currentSection).toBe(0);
        expect((0, emit_1.getLC)(ctx)).toBe(2); // 戻った時も続き
    });
    test("emitGapでゼロ埋めされ、LCが増える", () => {
        (0, emit_1.emitGap)(ctx, 4, { line: 0, file: "test.asm", phase: "emit" });
        const text = ctx.sections.get(0);
        expect(text.bytes).toEqual([0, 0, 0, 0]);
        expect(text.lc).toBe(4);
    });
    test("emitAlignで境界に揃えられる", () => {
        (0, emit_1.emitBytes)(ctx, [0x01, 0x02, 0x03], { line: 0, file: "test.asm", phase: "emit" });
        (0, emit_1.emitAlign)(ctx, 4, { line: 0, file: "test.asm", phase: "emit" });
        const text = ctx.sections.get(0);
        // 現在3 → 4バイト境界に揃うため +1ゼロが出力される
        expect(text.bytes.slice(-1)).toEqual([0x00]);
        expect(text.lc).toBe(4);
    });
    test("getLC / setLCでロケーションを取得・設定できる", () => {
        (0, emit_1.emitBytes)(ctx, [1, 2, 3], { line: 0, file: "test.asm", phase: "emit" });
        expect((0, emit_1.getLC)(ctx)).toBe(3);
        (0, emit_1.setLC)(ctx, 10);
        expect((0, emit_1.getLC)(ctx)).toBe(10);
        expect(ctx.loc).toBe(10);
    });
    test("複数セクション間で個別のLCが保持される", () => {
        (0, emit_1.emitBytes)(ctx, [1, 2, 3], { line: 0, file: "test.asm", phase: "emit" });
        (0, emit_1.emitSection)(ctx, "DATA");
        (0, emit_1.emitBytes)(ctx, [0xAA], { line: 0, file: "test.asm", phase: "emit" });
        expect((0, emit_1.getLC)(ctx)).toBe(1);
        (0, emit_1.emitSection)(ctx, "TEXT");
        expect((0, emit_1.getLC)(ctx)).toBe(3);
    });
});

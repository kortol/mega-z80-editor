import { AsmContext } from "../context";
import { assembleSource, phaseEmit } from "../testUtils";
// もし無ければ、既存の encoder/test と同じ手口で bytes を得るヘルパを使ってください。

function getBytes(ctx: AsmContext) {
  let bytes: number[] = [];
  for (let t of ctx.texts) {
    bytes = bytes.concat(t.data);
  }
  return bytes;
}


describe("macro stage2 - args & priority", () => {
  test("基本置換: FILLZ 10,0 => LD B,10 / LD (HL),0", () => {
    const src = `
FILLZ MACRO COUNT,VAL
  LD B,COUNT
  LD (HL),VAL
ENDM

  FILLZ 10,0
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    // LD B,10 = 06 0A;  LD (HL),0 = 36 00
    expect(getBytes(ctx)).toEqual([0x06, 0x0A, 0x36, 0x00]);
  });

  test("式内置換: COUNT+1", () => {
    const src = `
M MACRO COUNT
  LD B,COUNT+1
ENDM
  M 9
`;
    const ctx = assembleSource(phaseEmit, src, {  });

    // 9+1 は評価器で 10 → 06 0A
    expect(getBytes(ctx)).toEqual([0x06, 0x0A]);
  });

  test("誤置換防止: FOOCOUNT は COUNT 置換しない", () => {
    const src = `
M MACRO COUNT
  LD B,FOOCOUNT
ENDM
  M 7
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    // console.log(ctx.texts);
    // console.log(ctx.errors);
    // console.log(ctx.warnings);
    expect(ctx.errors).toHaveLength(1);
    // LD B,FOOCOUNT はレジスタ扱いでないため、ここは encode 側の仕様に依る。
    // 少なくとも "COUNT" 置換が走らないことを確認するため、アセンブル成功/失敗を検証。
    // 失敗するのが正しいなら:
    // expect(() => assembleSource(phaseEmit, src)).toThrow();
  });

  test("コメント/文字列は置換しない", () => {
    const src = `
P MACRO X
  ; X should not be replaced
  DB "X",0
  LD A,X
ENDM
  P 65
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    // DB "X",0 → 58h,00h （実装の文字→コード変換に依る） / LD A,65 → 3E 41h
    // 少なくとも末尾 3E 41 を確認
    expect(getBytes(ctx).slice(-2)).toEqual([0x3E, 65]);
  });

  test("引数不足", () => {
    const src = `
F MACRO A,B
  NOP
ENDM
  F 10
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    console.log(ctx.errors);
    expect(ctx.errors).toHaveLength(1);
    // expect(() => assembleSource(phaseEmit, src)).toThrow(/expected 2 args/i);
  });

  test("デフォルト値: 省略した引数を補完する", () => {
    const src = `
M MACRO A,B:2,C:3
  DB A,B,C
ENDM
  M 9
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    expect(getBytes(ctx)).toEqual([0x09, 0x02, 0x03]);
  });

  test("省略表記: 空引数はデフォルト値で補完する", () => {
    const src = `
M MACRO A,B:2,C:3
  DB A,B,C
ENDM
  M 9,,5
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    expect(getBytes(ctx)).toEqual([0x09, 0x02, 0x05]);
  });

  test("引数過剰", () => {
    const src = `
F MACRO A,B
  NOP
ENDM
  F 1,2,3
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    expect(ctx.errors).toHaveLength(1);
    // expect(() => assembleSource(phaseEmit, src)).toThrow(/expected 2 args/i);
  });

  test("マクロ優先（M80互換）: LD を上書き", () => {
    const src = `
LD MACRO X,Y
  DB X,Y
ENDM

  LD 1,2
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    expect(getBytes(ctx)).toEqual([0x01, 0x02]);
  });

  test("strictモード: 命令名上書きはエラー", () => {
    const src = `
LD MACRO X,Y
  DB X,Y
ENDM
`;
    const ctx = assembleSource(phaseEmit, src, { strictMacro: true }, "TEST");
    // console.log(ctx.options);
    expect(ctx.warnings).toHaveLength(0);
    expect(ctx.errors).toHaveLength(1);
    // console.log(ctx.errors);
    // expect(() => assembleSource(phaseEmit, src, "TEST", { strictMacro: true })).toThrow(/Cannot redefine instruction 'LD'/i);
  });

  test("ローカルラベル: %% 付きラベルは呼び出しごとに一意化される", () => {
    const src = `
LOOPMAC MACRO
%%LOOP:
  DJNZ %%LOOP
ENDM

  LOOPMAC
  LOOPMAC
`;

    const ctx = assembleSource(phaseEmit, src, {  });
    console.log(ctx);
    // 展開後: 各マクロで別々のローカルラベルが生成される
    const expandedLabels = Array.from(ctx.symbols.keys()).filter(k =>
      k.startsWith("__M_LOOPMAC_")
    );
    console.log(expandedLabels);

    // 呼び出し2回 → ラベル2つ生成されているはず
    expect(expandedLabels.length).toBe(2);

    // 衝突がない（=ユニーク名になっている）
    const uniqueCount = new Set(expandedLabels).size;
    expect(uniqueCount).toBe(2);
  });
});


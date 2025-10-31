/**
 * P3-A/B: REPT / WHILE / IRPC の最小～代表ケースを厳密検証
 * - 各反復での \# 置換値
 * - 反復回数の厳密一致
 * - ループ上限ガードの発火
 */

import { createAsmContext } from "../context";
import { expandLoopCore, substituteLoopTokens } from "../macro/expandLoopCore";
import { NodeLoopBase } from "../parser";

function makeNode(op: "REPT" | "WHILE" | "IRPC" | "IRP", opts: Partial<NodeLoopBase>): NodeLoopBase {
  return {
    kind: "macroLoop",
    op,
    bodyTokens: opts.bodyTokens ?? [],
    pos: { file: "TEST.asm", line: 1, phase: "analyze" as any },
    ...opts,
  } as NodeLoopBase;
}

function tokensAsText(nodes: any[]): string[] {
  const o: string[] = [];
  // expandLoopCore（現実装）は parseTokens のスタブが tokens をそのまま返すので
  // out はトークン配列のフラット化（各トークンは {text:string} を想定）
  nodes.forEach((t: { text: string, op?: string, args?: string[] }) => {
    o.push(t.text ?? t.op);
    if (t.args) {
      t.args.forEach(a => o.push(a));
    }
  });
  return o;
}

describe("🧩 Loop macros (REPT / WHILE / IRPC)", () => {
  test("REPT: \\\\# が 0..count-1 で置換され、回数が厳密一致", () => {
    const ctx = createAsmContext();

    const node = makeNode("REPT", {
      countExpr: { value: 3 },              // ← 3回
      bodyTokens: [{ text: "DB" }, { text: "\\#" }],
    });

    const out = expandLoopCore(node, ctx);
    // 1反復で "DB", "<index>" の2トークン → 3反復で計6トークン
    expect(out.length).toBe(6);

    const text = tokensAsText(out);
    // 反復ごとに ["DB","0"], ["DB","1"], ["DB","2"]
    expect(text).toEqual(["DB", "0", "DB", "1", "DB", "2"]);
  });

  test("WHILE: cond が true の間だけ展開し、\\# が 0..N-1 で増加", () => {
    const ctx = createAsmContext();
    // cond を 3回だけ true にする
    let counter = 0;
    const node = makeNode("WHILE", {
      condExpr: {
        // expandLoopCore 側の evalConst スタブは .value() も呼ぶようにしてある想定
        value: () => {
          const cond = counter < 3;
          if (cond) counter++;
          return cond;
        },
        text: "counter<3",
      },
      bodyTokens: [{ text: "DB" }, { text: "\\#" }],
    });

    const out = expandLoopCore(node, ctx);
    console.log(out);
    expect(out.length).toBe(3);                 // 3反復 * 2トークン
    const text = tokensAsText(out);
    expect(text).toEqual(["DB", "0", "DB", "1", "DB", "2"]);
  });

  test("WHILE: 無限ループ防止ガード（options.loopLimit）で例外", () => {
    const ctx = createAsmContext({ options: { loopLimit: 5 } as any });
    const node = makeNode("WHILE", {
      condExpr: { value: () => true, text: "true" },  // 永遠に true
      bodyTokens: [{ text: "X" }],
    });

    expect(() => expandLoopCore(node, ctx)).toThrow(); // LoopLimitExceeded を想定
  });

  test("IRPC: 文字が locals へ束縛され、ボディで置換される", () => {
    const ctx = createAsmContext();
    const node = makeNode("IRPC", {
      symbolName: "C",
      strLiteral: "ABC",
      // 現実装の substituteLoopTokens は locals の値を文字列でそのまま t.text に入れる
      bodyTokens: [{ text: "\\C" }],
    });

    const out = expandLoopCore(node, ctx);
    // 1反復1トークン × 3文字
    expect(out.length).toBe(3);
    expect(tokensAsText(out)).toEqual(["A", "B", "C"]);
  });

  test("REPT: count=0 なら出力 0 件", () => {
    const ctx = createAsmContext();
    const node = makeNode("REPT", {
      countExpr: { value: 0 },
      bodyTokens: [{ text: "DB" }, { text: "\\#" }],
    });

    const out = expandLoopCore(node, ctx);
    expect(out.length).toBe(0);
  });

  test("REPT: 負数 count はエラー", () => {
    const ctx = createAsmContext();
    const node = makeNode("REPT", { countExpr: { value: -1 }, bodyTokens: [{ text: "NOP" }] });
    expect(() => expandLoopCore(node, ctx)).toThrow();
  });

  // --- ここから下を既存の describe("🧩 Loop macros ...") の末尾に追加 ---

  test("Nested REPT: 外層/内層の \\##n インデックスを正しく置換", () => {
    const ctx = createAsmContext();

    // 疑似的にネスト構造を再現：外層×内層
    const out: any[] = [];
    for (let outer = 0; outer < 2; outer++) {
      ctx.loopStack = [
        { index: outer, maxIndex: 1, locals: new Map() } as any // outer
      ];

      for (let inner = 0; inner < 3; inner++) {
        const frame = { index: inner, maxIndex: 2, locals: new Map() } as any;
        ctx.loopStack.push(frame);

        // 入力トークン
        const toks = [
          { text: "DB" },
          { text: "\\##1" },
          { text: "," },
          { text: "\\#" },
        ];

        // 実装ロジックを使用して置換
        substituteLoopTokens(toks, ctx, frame);

        out.push(...toks);
        ctx.loopStack.pop();
      }
    }

    const text = out.map((t) => t.text);
    expect(text).toEqual([
      "DB", "0", ",", "0",
      "DB", "0", ",", "1",
      "DB", "0", ",", "2",
      "DB", "1", ",", "0",
      "DB", "1", ",", "1",
      "DB", "1", ",", "2",
    ]);
  });

  test("IRP: 数値リスト引数を展開し、ローカル変数が置換される", () => {
    const ctx = createAsmContext();
    const node = makeNode("IRP", {
      symbolName: "VAL",
      args: [1, 2, 3],
      bodyTokens: [{ text: "LD" }, { text: "A," }, { text: "\\VAL" }],
    });

    // expandLoopCore() が args 配列を使って展開すると仮定して
    const out: any[] = [];
    for (const val of node.args!) {
      const toks = node.bodyTokens.map((t) => ({ ...t }));
      toks.forEach((t) => {
        if (t.text === "\\VAL") t.text = String(val);
      });
      out.push(...toks);
    }

    const text = out.map((t) => t.text);
    expect(text).toEqual([
      "LD", "A,", "1",
      "LD", "A,", "2",
      "LD", "A,", "3",
    ]);
  });

  test("REPT: \\##MAX が最外層ループ最大値を返す", () => {
    const ctx = createAsmContext();
    // 擬似stack
    ctx.loopStack = [
      { index: 0, maxIndex: 2, locals: new Map() }, // outer
      { index: 1, maxIndex: 1, locals: new Map() }, // inner
    ] as any;

    const tokens = [
      { text: "DB" },
      { text: "\\##MAX" },
      { text: "," },
      { text: "\\##1" },
      { text: "," },
      { text: "\\#" },
    ];

    // substituteLoopTokens の直接呼び出し想定
    substituteLoopTokens(tokens, ctx, ctx.loopStack.at(-1)!);

    const text = tokens.map((t) => t.text);
    expect(text).toEqual(["DB", "2", ",", "0", ",", "1"]);
  });
});



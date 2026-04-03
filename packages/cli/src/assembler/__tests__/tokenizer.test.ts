import { AsmContext, createContext } from "../context";
import { tokenize, Token, parseNumber } from "../tokenizer";

function makeCtx(): AsmContext {
  return createContext({ moduleName: "TEST" });
}

function kinds(tokens: Token[]): string[] {
  return tokens.map((t) => t.kind + ":" + t.text);
}

describe("tokenizer", () => {
  // 1. 基本命令
  test("LD A,1", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,1");
    expect(kinds(toks)).toEqual([
      "ident:LD",
      "ident:A",
      "comma:,",
      "num:1",
      "eol:\n",
    ]);
    expect(toks[3].value).toBe(1);
  });

  // 2. コメント削除
  test("LD A,1 ; comment", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,1 ; comment");
    expect(kinds(toks)).toEqual([
      "ident:LD",
      "ident:A",
      "comma:,",
      "num:1",
      "eol:\n",
    ]);
  });

  // 3. ラベル付き
  test("START: LD A,2", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "START:  LD A,2");
    expect(kinds(toks)).toEqual([
      "ident:START",
      "colon::",
      "ident:LD",
      "ident:A",
      "comma:,",
      "num:2",
      "eol:\n",
    ]);
  });

  // 4. 複数行
  test("two lines", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,1\nLD B,2");
    expect(kinds(toks)).toEqual([
      "ident:LD",
      "ident:A",
      "comma:,",
      "num:1",
      "eol:\n",
      "ident:LD",
      "ident:B",
      "comma:,",
      "num:2",
      "eol:\n",
    ]);
  });

  // 5. 数値リテラル系
  test("hex 0x", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,0x1F");
    expect(toks[3].value).toBe(31);
  });
  test("hex $", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,$2A");
    expect(toks[3].value).toBe(42);
  });
  test("hex H", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,1FH");
    expect(toks[3].value).toBe(31);
  });
  test("bin %", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,%1010");
    expect(toks[3].value).toBe(10);
  });
  test("bin B", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,1010B");
    expect(toks[3].value).toBe(10);
  });
  test("decimal", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,255");
    expect(toks[3].value).toBe(255);
  });

  // 6. 疑似命令系
  test("ORG", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "ORG 100H");
    expect(toks[1].value).toBe(0x100);
  });
  test("EQU", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "FOO EQU 10");
    expect(kinds(toks)).toEqual(["ident:FOO", "ident:EQU", "num:10", "eol:\n"]);
  });

  // 7. 記号（括弧）
  test("paren", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,(1234H)");
    expect(kinds(toks)).toEqual([
      "ident:LD",
      "ident:A",
      "comma:,",
      "lparen:(",
      "num:1234H",
      "rparen:)",
      "eol:\n",
    ]);
    expect(toks[4].value).toBe(0x1234);
  });

  // 8. エラー系
  test("invalid char", () => {
    const ctx = makeCtx();
    expect(() => tokenize(ctx, "LD A,?")).toThrow();
  });
  test("invalid hex", () => {
    const ctx = makeCtx();
    expect(() => tokenize(ctx, "LD A,0x1G")).toThrow();
  });
  test("invalid bin", () => {
    const ctx = makeCtx();
    expect(() => tokenize(ctx, "LD A,10102B")).toThrow();
  });

  // 9. 空入力
  test("empty", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "");
    expect(kinds(toks)).toEqual(["eol:\n"]);
  });

  // 10. 複合
  test("multi with label and comment", () => {
    const ctx = makeCtx();
    const src = "START:  LD A,0x10\n  LD B,%1010 ; comment";
    const toks = tokenize(ctx, src);
    expect(kinds(toks)).toEqual([
      "ident:START",
      "colon::",
      "ident:LD",
      "ident:A",
      "comma:,",
      "num:0x10",
      "eol:\n",
      "ident:LD",
      "ident:B",
      "comma:,",
      "num:%1010",
      "eol:\n",
    ]);
  });

  // 11. 文字リテラル
  test("char literal simple", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,'A'");
    expect(toks.some((t) => t.text === "'A'")).toBe(true);
    // parseNumber で確認
    expect(parseNumber("'A'")).toBe(0x41);
  });

  test("char literal symbol", () => {
    expect(parseNumber("'#'")).toBe(0x23);
    expect(parseNumber("'0'")).toBe(0x30);
  });

  test("char literal escape", () => {
    expect(parseNumber("'\\n'")).toBe(10);
    expect(parseNumber("'\\''")).toBe(0x27);
  });

  test("invalid char literal", () => {
    expect(() => parseNumber("''")).toThrow();
    expect(() => parseNumber("'AB'")).toThrow();
  });

  test("char literal simple", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,'A'");
    expect(toks.find((t) => t.kind === "num")!.value).toBe(65); // 'A' = 0x41
  });
  test("char literal symbol", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,'#'");
    expect(toks.find((t) => t.kind === "num")!.value).toBe(35); // '#' = 0x23
  });
  test("empty char literal error", () => {
    const ctx = makeCtx();
    expect(() => tokenize(ctx, "LD A,''")).toThrow();
  });
  test("multi-char literal error", () => {
    const ctx = makeCtx();
    expect(() => tokenize(ctx, "LD A,'AB'")).toThrow();
  });

  test("whitespace tokens are skipped", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD\tA ,\v1\f");
    expect(toks.map((t) => t.text)).toEqual(["LD", "A", ",", "1", "\n"]); // whitespace tokens are skipped
  });

  test("CRLF and LF newlines", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,1\r\nLD B,2\n");
    expect(toks.filter((t) => t.kind === "eol")).toHaveLength(2);
  });

  test("EOF mark 0x1A stops tokenization", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "LD A,1\x1ALD B,2");
    expect(toks.map((t) => t.text)).toContain("LD");
    expect(toks.map((t) => t.text)).not.toContain("B"); // 打ち切られる
  });

  test("include", () => {
    const ctx = makeCtx();
    const tokens = tokenize(ctx, 'INCLUDE "mac.inc"');
    expect(tokens[0]).toMatchObject({ kind: "ident", text: "INCLUDE" });
    expect(tokens[1]).toMatchObject({ kind: "string", stringValue: "mac.inc" });
  });

  test("dot and at identifiers", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, ".@veccount := 1");
    expect(kinds(toks)).toEqual([
      "ident:.@veccount",
      "op::=",
      "num:1",
      "eol:\n",
    ]);
  });

  test("at counter", () => {
    const ctx = makeCtx();
    const toks = tokenize(ctx, "DB @#");
    expect(kinds(toks)).toEqual([
      "ident:DB",
      "ident:COUNTER",
      "eol:\n",
    ]);
  });
});

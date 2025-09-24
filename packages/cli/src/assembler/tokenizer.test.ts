import { tokenize, Token, parseNumber } from "./tokenizer";

function kinds(tokens: Token[]): string[] {
  return tokens.map(t => t.kind + ":" + t.text);
}

describe("tokenizer", () => {

  // 1. 基本命令
  test("LD A,1", () => {
    const toks = tokenize("LD A,1");
    expect(kinds(toks)).toEqual([
      "ident:LD", "ident:A", "comma:,", "num:1", "eol:\n"
    ]);
    expect(toks[3].value).toBe(1);
  });

  // 2. コメント削除
  test("LD A,1 ; comment", () => {
    const toks = tokenize("LD A,1 ; comment");
    expect(kinds(toks)).toEqual([
      "ident:LD", "ident:A", "comma:,", "num:1", "eol:\n"
    ]);
  });

  // 3. ラベル付き
  test("START: LD A,2", () => {
    const toks = tokenize("START:  LD A,2");
    expect(kinds(toks)).toEqual([
      "ident:START", "colon::", "ident:LD", "ident:A", "comma:,", "num:2", "eol:\n"
    ]);
  });

  // 4. 複数行
  test("two lines", () => {
    const toks = tokenize("LD A,1\nLD B,2");
    expect(kinds(toks)).toEqual([
      "ident:LD", "ident:A", "comma:,", "num:1", "eol:\n",
      "ident:LD", "ident:B", "comma:,", "num:2", "eol:\n"
    ]);
  });

  // 5. 数値リテラル系
  test("hex 0x", () => {
    const toks = tokenize("LD A,0x1F");
    expect(toks[3].value).toBe(31);
  });
  test("hex $", () => {
    const toks = tokenize("LD A,$2A");
    expect(toks[3].value).toBe(42);
  });
  test("hex H", () => {
    const toks = tokenize("LD A,1FH");
    expect(toks[3].value).toBe(31);
  });
  test("bin %", () => {
    const toks = tokenize("LD A,%1010");
    expect(toks[3].value).toBe(10);
  });
  test("bin B", () => {
    const toks = tokenize("LD A,1010B");
    expect(toks[3].value).toBe(10);
  });
  test("decimal", () => {
    const toks = tokenize("LD A,255");
    expect(toks[3].value).toBe(255);
  });

  // 6. 疑似命令系
  test("ORG", () => {
    const toks = tokenize("ORG 100H");
    expect(toks[1].value).toBe(0x100);
  });
  test("EQU", () => {
    const toks = tokenize("FOO EQU 10");
    expect(kinds(toks)).toEqual([
      "ident:FOO", "ident:EQU", "num:10", "eol:\n"
    ]);
  });

  // 7. 記号（括弧）
  test("paren", () => {
    const toks = tokenize("LD A,(1234H)");
    expect(kinds(toks)).toEqual([
      "ident:LD", "ident:A", "comma:,", "lparen:(", "num:1234H", "rparen:)", "eol:\n"
    ]);
    expect(toks[4].value).toBe(0x1234);
  });

  // 8. エラー系
  test("invalid char", () => {
    expect(() => tokenize("LD A,@123")).toThrow();
  });
  test("invalid hex", () => {
    expect(() => tokenize("LD A,0x1G")).toThrow();
  });
  test("invalid bin", () => {
    expect(() => tokenize("LD A,10102B")).toThrow();
  });

  // 9. 空入力
  test("empty", () => {
    const toks = tokenize("");
    expect(toks).toEqual([]);
  });

  // 10. 複合
  test("multi with label and comment", () => {
    const src = "START:  LD A,0x10\n  LD B,%1010 ; comment";
    const toks = tokenize(src);
    expect(kinds(toks)).toEqual([
      "ident:START", "colon::", "ident:LD", "ident:A", "comma:,", "num:0x10", "eol:\n",
      "ident:LD", "ident:B", "comma:,", "num:%1010", "eol:\n"
    ]);
  });

  // 11. 文字リテラル
  test("char literal simple", () => {
    const toks = tokenize("LD A,'A'");
    expect(toks.some(t => t.text === "'A'")).toBe(true);
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
    const toks = tokenize("LD A,'A'");
    expect(toks.find(t => t.kind === "num")!.value).toBe(65); // 'A' = 0x41
  });
  test("char literal symbol", () => {
    const toks = tokenize("LD A,'#'");
    expect(toks.find(t => t.kind === "num")!.value).toBe(35); // '#' = 0x23
  });
  test("empty char literal error", () => {
    expect(() => tokenize("LD A,''")).toThrow();
  });
  test("multi-char literal error", () => {
    expect(() => tokenize("LD A,'AB'")).toThrow();
  });

});

import { tokenize } from "../tokenizer";
import { parse, Node } from "../parser";

function parseLines(src: string): Node[] {
  return parse(tokenize(src));
}

describe("parser", () => {

  // 1. 命令のみ
  test("LD A,1", () => {
    const nodes = parseLines("LD A,1");
    expect(nodes).toEqual([
      { kind: "instr", op: "LD", args: ["A", "1"], line: 1 }
    ]);
  });

  // 2. コメント削除済み（空行確認）
  test("comment line is ignored", () => {
    const nodes = parseLines("LD A,1\n; comment\nLD B,2");
    expect(nodes).toEqual([
      { kind: "instr", op: "LD", args: ["A", "1"], line: 1 },
      { kind: "instr", op: "LD", args: ["B", "2"], line: 3 }
    ]);
  });

  // 3. ラベルのみ
  test("label only", () => {
    const nodes = parseLines("START:");
    expect(nodes).toEqual([
      { kind: "label", name: "START", line: 1 }
    ]);
  });

  // 4. ラベル＋命令
  test("label and instruction", () => {
    const nodes = parseLines("START: LD A,1");
    expect(nodes).toEqual([
      { kind: "label", name: "START", line: 1 },
      { kind: "instr", op: "LD", args: ["A", "1"], line: 1 }
    ]);
  });

  // 5. 疑似命令 ORG
  test("ORG pseudo", () => {
    const nodes = parseLines("ORG 100H");
    expect(nodes).toEqual([
      { kind: "pseudo", op: "ORG", args: ["100H"], line: 1 }
    ]);
  });

  // 6. 疑似命令 EQU
  test("EQU pseudo", () => {
    const nodes = parseLines("FOO EQU 10");
    // P1簡易仕様: "EQU" を疑似命令として扱い、args に残りを入れる
    expect(nodes).toEqual([
      { kind: "pseudo", op: "EQU", args: ["FOO", "10"], line: 1 }
    ]);
  });

  test("EQU with expression", () => {
    const nodes = parseLines("BAR EQU 0x100+10");
    expect(nodes).toEqual([
      { kind: "pseudo", op: "EQU", args: ["BAR", "0x100", "+", "10"], line: 1 }
    ]); 
  });

  // 7. 疑似命令 DB, DW
  test("DB and DW pseudo", () => {
    const nodes = parseLines("DB 1,2,3\nDW 100H");
    expect(nodes).toEqual([
      { kind: "pseudo", op: "DB", args: ["1", "2", "3"], line: 1 },
      { kind: "pseudo", op: "DW", args: ["100H"], line: 2 }
    ]);
  });

  // 8. 複数行
  test("multi-line instructions", () => {
    const nodes = parseLines("LD A,1\nCALL START");
    expect(nodes).toEqual([
      { kind: "instr", op: "LD", args: ["A", "1"], line: 1 },
      { kind: "instr", op: "CALL", args: ["START"], line: 2 }
    ]);
  });

  // エラー系 9. 未知命令
  test("unknown instruction", () => {
    expect(() => parseLines("FOOBAR 123")).toThrow(/Unknown operation/);
  });

  // エラー系 10. 行頭が数値
  test("line starts with number", () => {
    expect(() => parseLines("123 LD A,1")).toThrow(/Syntax error/);
  });

  // エラー系 11. コロンだけ
  test("colon only", () => {
    expect(() => parseLines(":")).toThrow(/Syntax error/);
  });

  test("label + EQU is invalid", () => {
    expect(() => parseLines("FOO: EQU 10")).toThrow(/EQU cannot be used/);
  });  
});

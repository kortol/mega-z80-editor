import { Token, tokenize } from "../tokenizer";
import { parse, Node } from "../parser";
import { AsmContext, createContext } from "../context";

function makeCtx(): AsmContext {
  return createContext({ moduleName: "TEST", currentFile: "test.asm" });
}

function parseLines(ctx: AsmContext, src: string): Node[] {
  return parse(ctx, tokenize(src));
}

describe("parser", () => {

  // 1. 命令のみ
  test("LD A,1", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "LD A,1");
    expect(nodes).toEqual([
      { kind: "instr", op: "LD", args: ["A", "1"], line: 1, file: "test.asm" }
    ]);
  });

  // 2. コメント削除済み（空行確認）
  test("comment line is ignored", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "LD A,1\n; comment\nLD B,2");
    expect(nodes).toEqual([
      { kind: "instr", op: "LD", args: ["A", "1"], line: 1, file: "test.asm" },
      { kind: "instr", op: "LD", args: ["B", "2"], line: 3, file: "test.asm" }
    ]);
  });

  // 3. ラベルのみ
  test("label only", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "START:");
    expect(nodes).toEqual([
      { kind: "label", name: "START", line: 1, file: "test.asm" }
    ]);
  });

  // 4. ラベル＋命令
  test("label and instruction", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "START: LD A,1");
    expect(nodes).toEqual([
      { kind: "label", name: "START", line: 1, file: "test.asm" },
      { kind: "instr", op: "LD", args: ["A", "1"], line: 1, file: "test.asm" }
    ]);
  });

  // 5. 疑似命令 ORG
  test("ORG pseudo", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "ORG 100H");
    expect(nodes).toEqual([
      { kind: "pseudo", op: "ORG", args: [{ value: "100H" }], line: 1, file: "test.asm" }
    ]);
  });

  // 6. 疑似命令 EQU
  test("EQU pseudo", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "FOO EQU 10");
    // P1簡易仕様: "EQU" を疑似命令として扱い、args に残りを入れる
    expect(nodes).toEqual([
      { kind: "pseudo", op: "EQU", args: [{ key: "FOO", value: "10" }], line: 1, file: "test.asm" }
    ]);
  });

  test("EQU with expression", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "BAR EQU 0x100+10");
    expect(nodes).toEqual([
      { kind: "pseudo", op: "EQU", args: [{ key: "BAR", value: "0x100, +, 10" }], line: 1, file: "test.asm" }
    ]);
  });

  // 7. 疑似命令 DB, DW
  test("DB and DW pseudo", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "DB 1,2,3\nDW 100H");
    expect(nodes).toEqual([
      { kind: "pseudo", op: "DB", args: [{ value: "1" }, { value: "2" }, { value: "3" }], line: 1, file: "test.asm" },
      { kind: "pseudo", op: "DW", args: [{ value: "100H" }], line: 2, file: "test.asm" }
    ]);
  });

  // 8. 複数行
  test("multi-line instructions", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "LD A,1\nCALL START");
    expect(nodes).toEqual([
      { kind: "instr", op: "LD", args: ["A", "1"], line: 1, file: "test.asm" },
      { kind: "instr", op: "CALL", args: ["START"], line: 2, file: "test.asm" }
    ]);
  });

  // エラー系 9. 未知命令
  test("unknown instruction", () => {
    const ctx = makeCtx();
    expect(() => parseLines(ctx, "FOOBAR 123")).toThrow(/Unknown operation/);
  });

  // エラー系 10. 行頭が数値
  test("line starts with number", () => {
    const ctx = makeCtx();
    expect(() => parseLines(ctx, "123 LD A,1")).toThrow(/Syntax error/);
  });

  // エラー系 11. コロンだけ
  test("colon only", () => {
    const ctx = makeCtx();
    expect(() => parseLines(ctx, ":")).toThrow(/Syntax error/);
  });

  test("label + EQU is invalid", () => {
    const ctx = makeCtx();
    expect(() => parseLines(ctx, "FOO: EQU 10")).toThrow(/EQU cannot be used/);
  });

  test("parse INCLUDE directive", () => {
    const ctx = makeCtx();
    const tokens: Token[] = [
      { kind: "ident", text: "INCLUDE", line: 1, col: 0 },
      {
        kind: "string",
        text: '"src/assembler/__tests__/mac.inc"',
        stringValue: 'src/assembler/__tests__/mac.inc',
        line: 1,
        col: 8
      },
      { kind: "eol", text: "\n", line: 1, col: 17 },
    ];
    const nodes = parse(ctx, tokens);
    console.log(nodes);
    expect(nodes).toEqual([
      {
        kind: "pseudo",
        op: "INCLUDE",
        args: [{ value: "src/assembler/__tests__/mac.inc" }],
        line: 1,
        file: "test.asm"
      },
    ]);
  });

  test("context basic", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, 'INCLUDE "src/assembler/__tests__/mac.inc"\nLD A,0');
    expect(nodes[0]).toMatchObject({
      kind: "pseudo",
      op: "INCLUDE",
      args: [{ value: "src/assembler/__tests__/mac.inc" }],
      file: "test.asm",
    });
    expect(nodes[1]).toMatchObject({
      kind: "instr",
      op: "LD",
      args: ["A", "0"],
      file: "test.asm",
    });
  });
});

import { Token, tokenize } from "../tokenizer";
import { parse, Node } from "../parser";
import { AsmContext, createContext } from "../context";

function makeCtx(): AsmContext {
  return createContext({ moduleName: "TEST", currentPos: { line: 0, file: "test.asm", phase: "parse" } });
}

function parseLines(ctx: AsmContext, src: string): Node[] {
  return parse(ctx, tokenize(ctx, src));
}

describe("parser", () => {

  // 1. 命令のみ
  test("LD A,1", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "LD A,1");
    expect(nodes).toEqual([
      { kind: "instr", op: "LD", args: ["A", "1"], pos: { line: 0, file: "test.asm", column: 0, phase: "parse" } }
    ]);
  });

  // 2. コメント削除済み（空行確認）
  test("comment line is ignored", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "LD A,1\n; comment\nLD B,2");
    expect(nodes).toEqual([
      { kind: "instr", op: "LD", args: ["A", "1"], pos: { line: 0, file: "test.asm", column: 0, phase: "parse" } },
      { kind: "instr", op: "LD", args: ["B", "2"], pos: { line: 2, file: "test.asm", column: 0, phase: "parse" } }
    ]);
  });

  // 3. ラベルのみ
  test("label only", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "START:");
    expect(nodes).toEqual([
      { kind: "label", name: "START", pos: { line: 0, file: "test.asm", column: 0, phase: "parse" } }
    ]);
  });

  // 4. ラベル＋命令
  test("label and instruction", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "START: LD A,1");
    expect(nodes).toEqual([
      { kind: "label", name: "START", pos: { line: 0, file: "test.asm", column: 0, phase: "parse" } },
      { kind: "instr", op: "LD", args: ["A", "1"], pos: { line: 0, file: "test.asm", column: 7, phase: "parse" } }
    ]);
  });

  // 5. 疑似命令 ORG
  test("ORG pseudo", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "ORG 100H");
    expect(nodes).toEqual([
      { kind: "pseudo", op: "ORG", args: [{ value: "100H" }], pos: { line: 0, file: "test.asm", column: 0, phase: "parse" } }
    ]);
  });

  // 6. 疑似命令 EQU
  test("EQU pseudo", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "FOO EQU 10");
    // P1簡易仕様: "EQU" を疑似命令として扱い、args に残りを入れる
    expect(nodes).toEqual([
      { kind: "pseudo", op: "EQU", args: [{ key: "FOO", value: "10" }], pos: { line: 0, file: "test.asm", column: 0, phase: "parse" } }
    ]);
  });

  test("EQU with expression", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "BAR EQU 0x100+10");
    expect(nodes).toEqual([
      { kind: "pseudo", op: "EQU", args: [{ key: "BAR", value: "0x100, +, 10" }], pos: { line: 0, file: "test.asm", column: 0, phase: "parse" } }
    ]);
  });

  // 7. 疑似命令 DB, DW
  test("DB and DW pseudo", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "DB 1,2,3\nDW 100H");
    expect(nodes).toEqual([
      { kind: "pseudo", op: "DB", args: [{ value: "1" }, { value: "2" }, { value: "3" }], pos: { line: 0, file: "test.asm", column: 0, phase: "parse" } },
      { kind: "pseudo", op: "DW", args: [{ value: "100H" }], pos: { line: 1, file: "test.asm", column: 0, phase: "parse" } }
    ]);
  });

  // 8. 複数行
  test("multi-line instructions", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "LD A,1\nCALL START");
    expect(nodes).toEqual([
      { kind: "instr", op: "LD", args: ["A", "1"], pos: { line: 0, file: "test.asm", column: 0, phase: "parse" } },
      { kind: "instr", op: "CALL", args: ["START"], pos: { line: 1, file: "test.asm", column: 0, phase: "parse" } }
    ]);
  });

  // エラー系 9. 未知命令
  test("unknown instruction", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, "FOOBAR 123");
    expect(nodes).toEqual([
      {
        kind: 'macroInvoke',
        name: 'FOOBAR',
        args: ['123'],
        pos: {
          file: 'test.asm',
          line: 0,
          column: 0,
          parent: undefined,
          phase: 'parse'
        }
      }
    ]);
  });

  // エラー系 10. 行頭が数値
  test("line starts with number", () => {
    const ctx = makeCtx();
    expect(() => {
      const c = parseLines(ctx, "123 LD A,1");
      console.log(c);
      return c;
    }).toThrow(/Syntax error/);
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
      { kind: "ident", text: "INCLUDE", pos: { file: "test.asm", line: 1, column: 0, phase: "parse" } },
      {
        kind: "string",
        text: '"src/assembler/__tests__/mac.inc"',
        stringValue: 'src/assembler/__tests__/mac.inc',
        pos: { file: "test.asm", line: 1, column: 8, phase: "parse" },
      },
      { kind: "eol", text: "\n", pos: { file: "test.asm", line: 1, column: 17, phase: "parse" } },
    ];
    const nodes = parse(ctx, tokens);
    console.log(nodes);
    expect(nodes).toEqual([
      {
        kind: "pseudo",
        op: "INCLUDE",
        args: [{ value: "src/assembler/__tests__/mac.inc" }],
        pos: {
          line: 1,
          file: "test.asm",
          column: 0,
          phase: "parse",
        },
      }
    ]);
  });

  test("context basic", () => {
    const ctx = makeCtx();
    const nodes = parseLines(ctx, 'INCLUDE "src/assembler/__tests__/mac.inc"\nLD A,0');
    expect(nodes[0]).toMatchObject({
      kind: "pseudo",
      op: "INCLUDE",
      args: [{ value: "src/assembler/__tests__/mac.inc" }],
      pos: {
        file: "test.asm",
      }
    });
    expect(nodes[1]).toMatchObject({
      kind: "instr",
      op: "LD",
      args: ["A", "0"],
      pos: {
        file: "test.asm",
      }
    });
  });
});

// src/assembler/__tests__/operand.classify.test.ts

import { classifyOperand } from "../classifyOperand";
import { OperandKind } from "../operandKind";

describe('classifyOperand - REG8', () => {
  test.each([
    ['A'], ['B'], ['C'], ['D'], ['E'], ['H'], ['L'],
    ['a'], ['h'], ['l'], // lower-case tolerant
  ])('REG8: %s', (s) => {
    expect(classifyOperand(s).kind).toBe(OperandKind.REG8);
  });
});

describe('classifyOperand - REG8X (IXH, IXL, IYH, IYL)', () => {
  test.each([
    ['IXH'], ['IXL'], ['IYH'], ['IYL'],
    ['ixh'], ['ixl'], ['iyh'], ['iyl'],
  ])('REG8X: %s', (s) => {
    expect(classifyOperand(s).kind).toBe(OperandKind.REG8X);
  });
});

describe('classifyOperand - REG16 (BC, DE, HL, SP)', () => {
  test.each([
    ['BC'], ['DE'], ['HL'], ['SP'],
    ['bc'], ['de'], ['hl'], ['sp'],
  ])('REG16: %s', (s) => {
    expect(classifyOperand(s).kind).toBe(OperandKind.REG16);
  });
});

describe('classifyOperand - REG16X (IX, IY)', () => {
  test.each([
    ['IX'], ['IY'],
    ['ix'], ['iy'],
  ])('REG16X: %s', (s) => {
    expect(classifyOperand(s).kind).toBe(OperandKind.REG16X);
  });
});

describe("classifyOperand - REG_AF / REG_AFd (AF, AF')", () => {
  test("REG_AF: AF", () => {
    expect(classifyOperand('AF').kind).toBe(OperandKind.REG_AF);
  });
  test("REG_AFd: AF'", () => {
    expect(classifyOperand("AF'").kind).toBe(OperandKind.REG_AFd);
  });
});

describe('classifyOperand - REG_IR (I, R)', () => {
  test.each([['I'], ['R'], ['i'], ['r']])('REG_IR: %s', (s) => {
    expect(classifyOperand(s).kind).toBe(OperandKind.REG_IR);
  });
});

describe('classifyOperand - FLAG (NZ,Z,NC,PO,PE,P,M)', () => {
  test.each([
    ['NZ'], ['Z'], ['NC'], ['PO'], ['PE'], ['P'], ['M'],
    ['nz'], ['z'], ['nc'], ['po'], ['pe'], ['p'], ['m'],
  ])('FLAG: %s', (s) => {
    expect(classifyOperand(s).kind).toBe(OperandKind.FLAG);
  });
});

describe('classifyOperand - IMM (numeric literals only)', () => {
  test.each([
    ['0'], ['42'], ['255'],                 // decimal
    ['1234H'], ['0FFH'], ['00A0H'],         // hex with suffix H (A-F許容)
    ['1010B'],                              // binary with suffix B (0/1のみ)
    ['77D'],                                // decimal with suffix D
    ['  1234H  '],                          // with spaces
    ['$1234'],                              // "$" prefix は16進扱いにする
  ])('IMM: %s', (s) => {
    expect(classifyOperand(s).kind).toBe(OperandKind.IMM);
  });

  test.each([
    ['102B'],   // invalid binary digits
    ['G123H'],  // invalid hex
    ['-1'],     // 負数はこの段では未サポートなら UNKNOWN か EXPR の方針次第（ここでは UNKNOWN とする）
  ])('NOT IMM (invalid numeric literal): %s', (s) => {
    expect(classifyOperand(s).kind).not.toBe(OperandKind.IMM);
  });
});

describe('classifyOperand - EXPR (labels / $ / @n / 式文字列)', () => {
  test.each([
    ['LABEL'], ['_START'], ['LOOP1'],          // labels
    ['$'], ['@1'],                             // special pseudo labels
    ['$+1'], ['LABEL+3'], ['@2-4'],            // 式（詳解は別スレ、ここでは EXPR 扱い）
    ['  label  '],                             // spaces trimmed
    ['[HL]'],                                  // [HL]だけ特例
    ['FOO.BAR'],                               // '.' をラベルに許可
  ])('EXPR: %s', (s) => {
    expect(classifyOperand(s).kind).toBe(OperandKind.EXPR);
  });

  test.each([
    ['1LABEL'],        // invalid label head
    ['@'],             // 不完全
  ])('NOT EXPR (invalid label-like): %s', (s) => {
    const kind = classifyOperand(s).kind;
    expect([OperandKind.EXPR, OperandKind.IMM]).not.toContain(kind);
  });
});

describe('classifyOperand - REG_IND ((HL),(SP),(BC),(DE))', () => {
  // 実運用上、(BC)/(DE) も REG_IND として扱うと LD A,(BC)/(DE) 等で便利
  test.each([
    ['(HL)'], ['(SP)'], ['(BC)'], ['(DE)'],
    ['( hl )'], ['( sp )'],
  ])('REG_IND: %s', (s) => {
    expect(classifyOperand(s).kind).toBe(OperandKind.REG_IND);
  });

  test.each([
    ['(AF)'], ['(IXH)'], // これらは存在しない間接
  ])('NOT REG_IND: %s', (s) => {
    expect(classifyOperand(s).kind).not.toBe(OperandKind.REG_IND);
  });
});

describe('classifyOperand - IDX ((IX+nn)/(IY+nn) with rules)', () => {
  test.each([
    ['(IX)'], ['(IY)'],               // +0 相当
    ['(IX+0)'], ['(IX+5)'], ['(IY-1)'],
    ['( ix + 10 )'], ['( iy - 0 )'],  // spacing tolerant
    ['(IX+LABEL)'], ['(IY+@1)'],      // displacement に式（未判定）を許容（分類は IDX）
  ])('IDX: %s', (s) => {
    expect(classifyOperand(s).kind).toBe(OperandKind.IDX);
  });

  test.each([
    ['(IX+)'], ['(IY-)'], ['(IX + )'], ['(IY -   )'], // "+/- 単独は不可"
  ])('INVALID IDX (should NOT classify as IDX): %s', (s) => {
    expect(classifyOperand(s).kind).not.toBe(OperandKind.IDX);
  });
});

describe('classifyOperand - MEM ((nn)/(LABEL) absolute address)', () => {
  test.each([
    ['(1234H)'], ['(  0FFH  )'],
    ['(LABEL)'], ['(  LABEL  )'],
    ['($)'], ['(@1)'], // ここでは中身の式評価はせず、括弧形状で MEM とする
    ['($+1)'], ['(LABEL+3)'], // 式でも括弧で包まれていれば MEM
  ])('MEM: %s', (s) => {
    expect(classifyOperand(s).kind).toBe(OperandKind.MEM);
  });

  test.each([
    ['()'], ['(   )'],           // 空括弧・空白のみは NG
    ['((1234H))'],               // 入れ子は NG（仕様により UNKNOWN 扱い推奨）
    ['('], [')'], ['(1234H'],    // 不完全
  ])('NOT MEM (invalid parentheses): %s', (s) => {
    expect(classifyOperand(s).kind).not.toBe(OperandKind.MEM);
  });
});

describe('classifyOperand - UNKNOWN (everything else)', () => {
  test.each([
    [''], ['   '],
    ['IX+'],        // 補助記号のみ
    ['(IX+)'],      // 既出だが UNKNOWN 扱いを確認
  ])('UNKNOWN: %s', (s) => {
    expect(classifyOperand(s).kind).toBe(OperandKind.UNKNOWN);
  });
});

describe('IDX operand parsing', () => {
  test('(IX+01H) should set disp=1', () => {
    const op = classifyOperand('(IX+01H)');
    expect(op.kind).toBe(OperandKind.IDX);
    expect(op.disp).toBe(1);
  });

  test('(IY-02H) should set disp=-2', () => {
    const op = classifyOperand('(IY-02H)');
    expect(op.kind).toBe(OperandKind.IDX);
    expect(op.disp).toBe(-2);
  });

  test('(IX) should set disp=0', () => {
    const op = classifyOperand('(IX)');
    expect(op.kind).toBe(OperandKind.IDX);
    expect(op.disp).toBe(0);
  });
});
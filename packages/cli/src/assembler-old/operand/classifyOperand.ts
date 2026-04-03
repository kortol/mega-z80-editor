import { AsmContext } from '../context';
import { parseExpr } from '../expr/parserExpr';
import { parseNumber, tokenize } from '../tokenizer';
import { OperandKind } from './operandKind';

export interface OperandInfo {
  kind: OperandKind;
  raw: string;
  text?: string;
  // IX/IY 変位値を保持する（IDXの場合のみ有効）
  disp?: number;
}

// 補助関数
function isNumericLiteral(s: string): boolean {
  // 16進: 1234H or $1234
  if (/^[0-9A-F]+H$/i.test(s)) return true;
  if (/^\$[0-9A-F]+$/i.test(s)) return true;

  // 2進: 1010B
  if (/^[01]+B$/i.test(s)) return true;

  // 10進: 123 or 123D
  if (/^[0-9]+D?$/i.test(s)) return true;

  return false;
}

function isLabelLike(s: string): boolean {
  return /^([A-Z_][A-Z0-9_]*|\$|@[\d]+)([+\-][A-Z0-9_\$@]+)?$/i.test(s);
}

export function classifyOperand(ctx: AsmContext, s: string): OperandInfo {
  const t = s.trim().toUpperCase();

  // 特例: [HL]
  if (t === '[HL]') return { kind: OperandKind.EXPR, raw: t };

  // --- (IX+nn) / (IY+nn) / (IX-nn) / (IY) ---
  const m = /^\(\s*(IX|IY)(?:\s*([+-])\s*([A-Z0-9\$@]+))?\s*\)$/i.exec(t);
  if (m) {
    let disp = 0;
    if (m[2] && m[3]) {
      try {
        const val = parseNumber(m[3]);
        disp = m[2] === "-" ? -val : val;
      } catch {
        disp = 0;
      }
    }
    return { kind: OperandKind.IDX, raw: t, disp };
  }

  // MEM: (expr) ただし無効・入れ子は除外
  if (/^\(.+\)$/.test(t)) {
    const inner = t.slice(1, -1).trim();

    // 空 or 入れ子なら無効
    if (!inner) return { kind: OperandKind.UNKNOWN, raw: t };
    if (/^\(.*\)$/.test(inner)) return { kind: OperandKind.UNKNOWN, raw: t };

    // NGパターン: "IX+" / "IY-" のような未完成の式
    if (/^(IX|IY)\s*[+-]\s*$/i.test(inner)) {
      return { kind: OperandKind.UNKNOWN, raw: t };
    }

    // REG_IND以外ならMEM
    if (!/^(HL|SP|BC|DE|IX|IY)$/i.test(inner)) {
      return { kind: OperandKind.MEM, raw: t };
    }
  }

  // REG_IND: (HL),(SP),(BC),(DE)
  if (/^\(\s*(HL|SP|BC|DE)\s*\)$/.test(t)) {
    return { kind: OperandKind.REG_IND, raw: t };
  }

  // レジスタ群
  if (/^(A|B|C|D|E|H|L)$/.test(t)) return { kind: OperandKind.REG8, raw: t };
  if (/^(IXH|IXL|IYH|IYL)$/.test(t)) return { kind: OperandKind.REG8X, raw: t };
  if (/^(BC|DE|HL|SP)$/.test(t)) return { kind: OperandKind.REG16, raw: t };
  if (/^(IX|IY)$/.test(t)) return { kind: OperandKind.REG16X, raw: t };
  if (t === 'AF') return { kind: OperandKind.REG_AF, raw: t };
  if (t === "AF'") return { kind: OperandKind.REG_AFd, raw: t };
  if (/^(I|R)$/.test(t)) return { kind: OperandKind.REG_IR, raw: t };

  // FLAGS
  if (/^(NZ|Z|NC|C|PO|PE|P|M)$/.test(t)) {
    return { kind: OperandKind.FLAG, raw: t };
  }

  // IMM
  if (isNumericLiteral(t)) {
    return { kind: OperandKind.IMM, raw: t };
  }

  // EXPR
  if (isLabelLike(t)) {
    return { kind: OperandKind.EXPR, raw: t };
  }
  // --- EXPR ---
  try {
    const tokens = tokenize(ctx, t).filter(t => t.kind !== "eol");
    const expr = parseExpr(tokens);
    // AST が生成できれば式として有効
    if (expr) {
      return { kind: OperandKind.EXPR, raw: t };
    }
  } catch {
    // 式として解釈できない場合は無視
  }

  return { kind: OperandKind.UNKNOWN, raw: t };
}

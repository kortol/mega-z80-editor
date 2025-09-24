import { AsmContext } from "./context";
import { NodeInstr } from "./parser";
import { parseNumber } from "./tokenizer";

export function encodeInstr(ctx: AsmContext, node: NodeInstr): void {
  switch (node.op) {
    case "LD":
      encodeLD(ctx, node);
      break;
    case "CALL":
      encodeCALL(ctx, node);
      break;
    case "JR":
      encodeJR(ctx, node);
      break;
    default:
      throw new Error(`Unsupported instruction ${node.op} at line ${node.line}`);
  }
}

// --- 共通値解決 ---
function resolveValue(ctx: AsmContext, expr: string): number {
  if (expr === "$") return ctx.loc;
  return parseNumber(expr);
}

function encodeLD(ctx: AsmContext, node: NodeInstr) {
  const [dst, src] = node.args;

  // LD r,imm8
  if (isReg(dst) && (/^\d+$/.test(src) || /^'.'$/.test(src))) {
    let val: number;
    if (/^'.'$/.test(src)) {
      val = src.charCodeAt(1); // 文字リテラル '#'
    } else {
      val = parseInt(src, 10);
    }
    const opcode = 0x06 | (regCode(dst) << 3); // LD r,n の基本形
    ctx.texts.push({ addr: ctx.loc, data: [opcode, val & 0xFF] });
    ctx.loc += 2;
    return;
  }

  // LD r,r2
  if (isReg(dst) && isReg(src)) {
    const opcode = 0x40 | (regCode(dst) << 3) | regCode(src);
    ctx.texts.push({ addr: ctx.loc, data: [opcode] });
    ctx.loc += 1;
    return;
  }

  throw new Error(`Unsupported LD form at line ${node.line}`);
}

function encodeCALL(ctx: AsmContext, node: NodeInstr) {
  const target = node.args[0];
  if (/^\d+$/.test(target) || /^[0-9A-Fa-f]+H$/.test(target) || /^0x/i.test(target) || target === "$" || /^%[01]+/.test(target) || /^'.+'$/.test(target)) {
    const val = resolveValue(ctx, target);
    ctx.texts.push({ addr: ctx.loc, data: [0xCD, val & 0xFF, (val >> 8) & 0xFF] });
    ctx.loc += 3;
  } else {
    // シンボル未解決
    ctx.texts.push({ addr: ctx.loc, data: [0xCD, 0x00, 0x00] });
    ctx.unresolved.push({ addr: ctx.loc + 1, symbol: target, size: 2 });
    ctx.loc += 3;
  }
}

function encodeJR(ctx: AsmContext, node: NodeInstr) {
  const target = node.args[0];
  const val = resolveValue(ctx, target);
  // JR のオフセットは -128〜+127 が有効範囲
  const offset = (val - (ctx.loc + 2));
  if (offset < -128 || offset > 127) {
    throw new Error(`JR target out of range at line ${node.line}`);
  }
  ctx.texts.push({ addr: ctx.loc, data: [0x18, offset & 0xFF] });
  ctx.loc += 2;
}

function isReg(r: string): boolean {
  return ["A", "B", "C", "D", "E", "H", "L"].includes(r);
}

function regCode(r: string): number {
  const table: Record<string, number> = {
    B: 0, C: 1, D: 2, E: 3, H: 4, L: 5, A: 7
  };
  return table[r];
}

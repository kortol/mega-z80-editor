// src/assembler/pseudo/data.ts
import { emitBytes, emitFixup, emitGap, emitWord, getLC } from "../codegen/emit";
import { AsmContext } from "../context";
import { resolveExpr16, resolveExpr8 } from "../encoder/utils";
import { parseExternExpr } from "../expr/parseExternExpr";
import { NodePseudo } from "../parser";

function bytesFromLiteral(arg: string): number[] {
  if (arg.startsWith('"') && arg.endsWith('"')) {
    return arg
      .slice(1, -1)
      .split("")
      .map((ch) => ch.charCodeAt(0) & 0xff);
  }
  if (arg.startsWith("'") && arg.endsWith("'") && arg.length === 3) {
    return [arg.charCodeAt(1) & 0xff];
  }
  return [];
}

// -----------------------------------------------------
// DB (Define Byte)
// -----------------------------------------------------
export function handleDB(ctx: AsmContext, node: NodePseudo) {
  const bytes: number[] = [];
  const sec = ctx.sections.get(ctx.currentSection)!;
  for (const a of node.args) {
    const valStr = a.value;
    // --- 文字列／文字 ---
    const lit = bytesFromLiteral(valStr);
    if (lit.length) {
      bytes.push(...lit);
      continue;
    }

    // --- 外部シンボル ± 定数 ---
    const ext = parseExternExpr(ctx, valStr);
    if (ext) {
      if (bytes.length) {
        // 外部シンボルは単独レコード扱い（1バイト仮確保）
        emitBytes(ctx, bytes, node.line); // ← ここでバッファをフラッシュ
        bytes.length = 0;
      }
      if (ctx.pass == 2) {
        emitFixup(ctx, ext.symbol, 1, ext.addend, node.line);
      }
      continue;
    }

    // --- 通常の式 (例: 1+2*3) ---
    const val = resolveExpr8(ctx, valStr, node.line);
    if (val < 0 || val > 0xff) {
      ctx.warnings?.push?.(`DB value ${val} truncated at line ${node.line}`);
    }
    bytes.push(val & 0xFF);
  }
  if (bytes.length > 0) {
    emitBytes(ctx, bytes, node.line);
  }
}

// -----------------------------------------------------
// DW (Define Word)
// -----------------------------------------------------
export function handleDW(ctx: AsmContext, node: NodePseudo) {
  const words: number[] = [];
  for (const a of node.args) {
    const valStr = a.value;
    if (valStr.startsWith('"') && valStr.endsWith('"')) {
      throw new Error(`DW does not support string literal`);
    }

    // --- 外部シンボル ± 定数 ---
    const ext = parseExternExpr(ctx, valStr);
    if (ext) {
      // 途中で外部シンボルが出た場合は、現バッファをフラッシュしてemit
      if (words.length > 0) {
        const bytes: number[] = [];
        for (const w of words) bytes.push(w & 0xFF, (w >> 8) & 0xFF);
        emitBytes(ctx, bytes, node.line);
        words.length = 0;
      }
      if (ctx.pass == 2) {
        emitFixup(ctx, ext.symbol, 2, ext.addend, node.line);
      }
      continue;
    }

    // --- 通常の式（Reloc禁止で評価） ---
    const val = resolveExpr16(ctx, valStr, node.line, false, true);
    if (val < -0x8000 || val > 0xffff) {
      ctx.warnings?.push?.(`DW value ${val} truncated at line ${node.line}`);
    }
    words.push(val);
  }
  // 🔹最後にまとめてemit
  if (words.length > 0) {
    const bytes: number[] = [];
    for (const w of words) bytes.push(w & 0xFF, (w >> 8) & 0xFF);
    emitBytes(ctx, bytes, node.line);
  }
}

// -----------------------------------------------------
// DS (Define Storage)
// -----------------------------------------------------
export function handleDS(ctx: AsmContext, node: NodePseudo) {

  const valStr = node.args[0].value;
  // (将来案) handleDS 内に追加
  const ext = parseExternExpr(ctx, valStr);
  if (ext) {
    ctx.unresolved.push({ addr: getLC(ctx), symbol: ext.symbol, size: 0, addend: ext.addend });
    return;
  }

  const count = Number(node.args?.[0]?.value ?? 0);
  emitGap(ctx, count, node.line);
}


export function handleWORD32(ctx: AsmContext, node: NodePseudo) {
  if (node.args.length > 0) {
    throw new Error(`.WORD32 does not take operands at line ${node.line}`);
  }
  ctx.modeWord32 = true;
}

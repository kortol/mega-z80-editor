import { AsmContext } from "../context";
import { resolveExpr16, resolveExpr8 } from "../encoder/utils";
import { parseExternExpr } from "../expr/parseExternExpr";
import { NodePseudo } from "../parser";

function bytesFromLiteral(arg: string): number[] {
  if (arg.startsWith('"') && arg.endsWith('"')) {
    return arg.slice(1, -1).split("").map(ch => ch.charCodeAt(0) & 0xFF);
  }
  if (arg.startsWith("'") && arg.endsWith("'") && arg.length === 3) {
    return [arg.charCodeAt(1) & 0xFF];
  }
  return [];
}

export function handleDB(ctx: AsmContext, node: NodePseudo) {
  const bytes: number[] = [];
  for (const a of node.args) {
    // --- 文字列／文字 ---
    const lit = bytesFromLiteral(a);
    if (lit.length > 0) {
      bytes.push(...lit);
      continue;
    }

    // --- 外部シンボル ± 定数 ---
    const ext = parseExternExpr(ctx, a);
    if (ext) {
      const addr = ctx.loc + bytes.length;
      bytes.push(0x00);
      ctx.unresolved.push({ addr, symbol: ext.symbol, size: 1, addend: ext.addend });
      continue;
    }

    // --- 通常の式 (例: 1+2*3) ---
    const val = resolveExpr8(ctx, a, node.line);
    if (val < 0 || val > 0xFF) {
      ctx.warnings?.push?.(`DB value ${val} truncated at line ${node.line}`);
    }
    bytes.push(val & 0xFF);
  }
  ctx.texts.push({ addr: ctx.loc, data: bytes });
  ctx.loc += bytes.length;
}

export function handleDW(ctx: AsmContext, node: NodePseudo) {
  for (const a of node.args) {
    if (a.startsWith('"') && a.endsWith('"')) {
      throw new Error(`DW does not support string literal`);
    }

    // --- 外部シンボル ± 定数 ---
    const ext = parseExternExpr(ctx, a);
    if (ext) {
      const addr = ctx.loc;
      ctx.texts.push({ addr, data: [0x00, 0x00] });
      ctx.unresolved.push({ addr, symbol: ext.symbol, size: 2, addend: ext.addend });
      ctx.loc += 2;
      continue;
    }

    // --- 通常の式 ---
    const val = resolveExpr16(ctx, a, node.line);
    if (val < -0x8000 || val > 0xFFFF) {
      ctx.warnings?.push?.(`DW value ${val} truncated at line ${node.line}`);
    }
    ctx.texts.push({
      addr: ctx.loc,
      data: [val & 0xFF, (val >> 8) & 0xFF],
    });
    ctx.loc += 2;
  }
}

export function handleWORD32(ctx: AsmContext, node: NodePseudo) {
  if (node.args.length > 0) {
    throw new Error(`.WORD32 does not take operands at line ${node.line}`);
  }
  ctx.modeWord32 = true;
}

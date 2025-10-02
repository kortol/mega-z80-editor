import { AsmContext } from "../context";
import { NodePseudo } from "../parser";
import { resolveExpr8, resolveExpr16 } from "../encoder/utils";

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
  for (const raw of node.args) {
    const a = raw.trim();   // ← ここで必ずトリム
    console.log(`a:${a}`);
    const lit = bytesFromLiteral(a);
    if (lit.length > 0) {
      bytes.push(...lit);
      continue;
    }
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
  for (const raw of node.args) {
    const a = raw.trim();   // ← 同じくトリム
    console.log(`a:${a}`);
    if (a.startsWith('"') && a.endsWith('"')) {
      throw new Error(`DW does not support string literal`);
    }
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

// src/assembler/pseudo/data.ts
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

export function handleDB(ctx: AsmContext, node: NodePseudo) {
  const sec = ctx.sections.get(ctx.currentSection)!;
  for (const a of node.args) {
    const valStr = a.value;
    // --- 文字列／文字 ---
    const lit = bytesFromLiteral(valStr);
    if (lit.length > 0) {
      const addr = sec.lc;
      sec.lc += lit.length;
      ctx.texts.push({
        addr,
        data: lit,
        line: node.line,
        sectionId: ctx.currentSection,
      });
      ctx.loc = sec.lc;
      continue;
    }

    // --- 外部シンボル ± 定数 ---
    const ext = parseExternExpr(ctx, valStr);
    if (ext) {
      const addr = sec.lc;
      sec.lc += 1;
      ctx.loc = sec.lc;
      ctx.texts.push({
        addr,
        data: [0x00],
        line: node.line,
        sectionId: ctx.currentSection,
      });
      if (ctx.pass === 2) {
        ctx.unresolved.push({
          addr,
          symbol: ext.symbol,
          size: 1,
          addend: ext.addend,
        });
      }
      continue;
    }

    // --- 通常の式 (例: 1+2*3) ---
    const val = resolveExpr8(ctx, valStr, node.line);
    if (val < 0 || val > 0xff) {
      ctx.warnings?.push?.(`DB value ${val} truncated at line ${node.line}`);
    }
    const addr = sec.lc;
    sec.lc += 1;
    ctx.texts.push({
      addr,
      data: [val & 0xff],
      line: node.line,
      sectionId: ctx.currentSection,
    });
    ctx.loc = sec.lc;
  }
}

export function handleDW(ctx: AsmContext, node: NodePseudo) {
  const sec = ctx.sections.get(ctx.currentSection)!;
  for (const a of node.args) {
    const valStr = a.value;
    if (valStr.startsWith('"') && valStr.endsWith('"')) {
      throw new Error(`DW does not support string literal`);
    }

    const addr = sec.lc;
    sec.lc += 2;
    ctx.loc = sec.lc;

    // --- 外部シンボル ± 定数 ---
    const ext = parseExternExpr(ctx, valStr);
    if (ext) {
      // どちらのパスでもダミーデータは書く
      ctx.texts.push({
        addr,
        data: [0x00, 0x00],
        line: node.line,
        sectionId: ctx.currentSection,
      });

      // ✅ pass=2のときのみ未解決登録
      if (ctx.pass === 2) {
        ctx.unresolved.push({
          addr,
          symbol: ext.symbol,
          size: 2,
          addend: ext.addend,
        });
      }
      continue;
    }

    // --- 通常の式（Reloc禁止で評価） ---
    const val = resolveExpr16(ctx, valStr, node.line, false, true);
    if (val < -0x8000 || val > 0xffff) {
      ctx.warnings?.push?.(`DW value ${val} truncated at line ${node.line}`);
    }
    ctx.texts.push({
      addr,
      data: [val & 0xff, (val >> 8) & 0xff],
      line: node.line,
      sectionId: ctx.currentSection,
    });
  }
}

export function handleWORD32(ctx: AsmContext, node: NodePseudo) {
  if (node.args.length > 0) {
    throw new Error(`.WORD32 does not take operands at line ${node.line}`);
  }
  ctx.modeWord32 = true;
}

/**
 * DS (Define Storage)
 * 指定されたバイト数ぶんだけゼロ埋めを行う
 */
export function handleDS(ctx: AsmContext, node: NodePseudo) {
  const count = Number(node.args?.[0]?.value ?? 0);
  const sec = ctx.sections.get(ctx.currentSection);
  if (!sec) return;

  const addr = sec.lc;
  sec.lc += count;
  ctx.loc = sec.lc; // 🔹 同期  

  const zeros = new Array(count).fill(0);
  sec.bytes.push(...zeros);
  sec.size += count;

  ctx.texts.push({
    addr,
    data: zeros,
    line: node.line,
    sectionId: ctx.currentSection,
  });
}

import { AsmContext } from "../context";
import { NodeInstr } from "../parser";
import { resolveValue } from "./utils";

// --- 条件コードテーブル ---
const condCodes: Record<string, number> = {
  NZ: 0x00,
  Z: 0x08,
  NC: 0x10,
  C: 0x18,
  PO: 0x20,
  PE: 0x28,
  P: 0x30,
  M: 0x38,
};

// --- JP ---
export function encodeJP(ctx: AsmContext, node: NodeInstr) {
  if (node.args.length === 1) {
    const target = node.args[0];
    if (target === "(HL)") {
      ctx.texts.push({ addr: ctx.loc, data: [0xe9] });
      ctx.loc += 1;
      return;
    }
    if (target === "(IX)") {
      ctx.texts.push({ addr: ctx.loc, data: [0xdd, 0xe9] });
      ctx.loc += 2;
      return;
    }
    if (target === "(IY)") {
      ctx.texts.push({ addr: ctx.loc, data: [0xfd, 0xe9] });
      ctx.loc += 2;
      return;
    }
    const val = resolveValue(ctx, target);
    if (val === null) {
      ctx.texts.push({ addr: ctx.loc, data: [0xc3, 0, 0] });
      ctx.unresolved.push({ addr: ctx.loc + 1, symbol: target, size: 2 });
    } else {
      ctx.texts.push({
        addr: ctx.loc,
        data: [0xc3, val & 0xff, (val >> 8) & 0xff],
      });
    }
    ctx.loc += 3;
    return;
  }
  if (node.args.length === 2) {
    const cond = node.args[0];
    const target = node.args[1];
    if (!(cond in condCodes))
      throw new Error(`Unsupported JP condition ${cond}`);
    const val = resolveValue(ctx, target);
    const opcode = 0xc2 | condCodes[cond];
    if (val === null) {
      ctx.texts.push({ addr: ctx.loc, data: [opcode, 0, 0] });
      ctx.unresolved.push({ addr: ctx.loc + 1, symbol: target, size: 2 });
    } else {
      ctx.texts.push({
        addr: ctx.loc,
        data: [opcode, val & 0xff, (val >> 8) & 0xff],
      });
    }
    ctx.loc += 3;
    return;
  }
  throw new Error(`Unsupported JP form at line ${node.line}`);
}

// --- JR ---
export function encodeJR(ctx: AsmContext, node: NodeInstr) {
  let cond: string | null = null;
  let target: string;

  if (node.args.length === 1) {
    target = node.args[0];
  } else if (node.args.length === 2) {
    cond = node.args[0];
    target = node.args[1];
  } else {
    throw new Error(`Invalid JR args at line ${node.line}`);
  }

  const val = resolveValue(ctx, target);
  if (val === null) {
    const opcode = cond
      ? ({ NZ: 0x20, Z: 0x28, NC: 0x30, C: 0x38 } as Record<string, number>)[
          cond
        ] ?? null
      : 0x18;
    if (opcode === null) throw new Error(`JR only supports NZ/Z/NC/C`);
    ctx.texts.push({ addr: ctx.loc, data: [opcode, 0x00] });
    ctx.unresolved.push({
      addr: ctx.loc + 1,
      symbol: target,
      size: 1,
      relative: true,
    });
    ctx.loc += 2;
    return;
  }

  const offset = val - (ctx.loc + 2);
  if (offset < -128 || offset > 127) {
    throw new Error(`JR target out of range at line ${node.line}`);
  }

  if (!cond) {
    ctx.texts.push({ addr: ctx.loc, data: [0x18, offset & 0xff] });
    ctx.loc += 2;
    return;
  }

  const base = { NZ: 0x20, Z: 0x28, NC: 0x30, C: 0x38 }[cond];
  if (base === undefined) throw new Error(`JR only supports NZ/Z/NC/C`);
  ctx.texts.push({ addr: ctx.loc, data: [base, offset & 0xff] });
  ctx.loc += 2;
}

// --- CALL ---
export function encodeCALL(ctx: AsmContext, node: NodeInstr) {
  if (node.args.length === 1) {
    const val = resolveValue(ctx, node.args[0]);
    if (val === null) {
      ctx.texts.push({ addr: ctx.loc, data: [0xcd, 0, 0] });
      ctx.unresolved.push({ addr: ctx.loc + 1, symbol: node.args[0], size: 2 });
    } else {
      ctx.texts.push({
        addr: ctx.loc,
        data: [0xcd, val & 0xff, (val >> 8) & 0xff],
      });
    }
    ctx.loc += 3;
    return;
  }
  if (node.args.length === 2) {
    const cond = node.args[0];
    const val = resolveValue(ctx, node.args[1]);
    if (!(cond in condCodes))
      throw new Error(`Unsupported CALL condition ${cond}`);
    const opcode = 0xc4 | condCodes[cond];
    if (val === null) {
      ctx.texts.push({ addr: ctx.loc, data: [opcode, 0, 0] });
      ctx.unresolved.push({ addr: ctx.loc + 1, symbol: node.args[1], size: 2 });
    } else {
      ctx.texts.push({
        addr: ctx.loc,
        data: [opcode, val & 0xff, (val >> 8) & 0xff],
      });
    }
    ctx.loc += 3;
    return;
  }
  throw new Error(`Unsupported CALL form at line ${node.line}`);
}

// --- RET ---
export function encodeRET(ctx: AsmContext, node: NodeInstr) {
  if (node.args.length === 0) {
    ctx.texts.push({ addr: ctx.loc, data: [0xc9] });
    ctx.loc += 1;
    return;
  }
  const cond = node.args[0];
  if (!(cond in condCodes))
    throw new Error(`Unsupported RET condition ${cond}`);
  const opcode = 0xc0 | condCodes[cond];
  ctx.texts.push({ addr: ctx.loc, data: [opcode] });
  ctx.loc += 1;
}

// --- RST ---
export function encodeRST(ctx: AsmContext, node: NodeInstr) {
  const val = resolveValue(ctx, node.args[0]);
  if (val === null) {
    throw new Error(`Unresolved symbol in RST not supported: ${node.args[0]}`);
  }
  if (val % 8 !== 0 || val < 0 || val > 0x38) {
    throw new Error(`Invalid RST vector ${val}`);
  }
  const opcode = 0xc7 + val;
  ctx.texts.push({ addr: ctx.loc, data: [opcode] });
  ctx.loc += 1;
}

// --- DJNZ ---
export function encodeDJNZ(ctx: AsmContext, node: NodeInstr) {
  if (node.args.length !== 1) {
    throw new Error(`Invalid DJNZ args at line ${node.line}`);
  }

  const target = node.args[0];
  const val = resolveValue(ctx, target);

  if (val === null) {
    ctx.texts.push({ addr: ctx.loc, data: [0x10, 0x00] });
    ctx.unresolved.push({
      addr: ctx.loc + 1,
      symbol: target,
      size: 1,
      relative: true,
    });
    ctx.loc += 2;
    return;
  }

  const offset = val - (ctx.loc + 2);
  if (offset < -128 || offset > 127) {
    throw new Error(`DJNZ target out of range at line ${node.line}`);
  }

  ctx.texts.push({ addr: ctx.loc, data: [0x10, offset & 0xff] });
  ctx.loc += 2;
}

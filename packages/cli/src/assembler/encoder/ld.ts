import { AsmContext } from "../context";
import { NodeInstr } from "../parser";
import {
  resolveValue,
  regCode,
  reg16Code,
  isReg8,
  isReg16,
  isImm8,
  isImm16,
  isAbs16,
  isMemAddress,
  parseIndexAddr,
} from "./utils";

export function encodeLD(ctx: AsmContext, node: NodeInstr) {
  const [dst, src] = node.args;

  // --- LD r,r2 ---
  if (isReg8(dst) && isReg8(src)) {
    const opcode = 0x40 | (regCode(dst) << 3) | regCode(src);
    ctx.texts.push({ addr: ctx.loc, data: [opcode] });
    ctx.loc += 1;
    return;
  }

  // --- LD r,(HL) ---
  if (isReg8(dst) && src === "(HL)") {
    const opcode = 0x46 | (regCode(dst) << 3);
    ctx.texts.push({ addr: ctx.loc, data: [opcode] });
    ctx.loc += 1;
    return;
  }

  // --- LD (HL),r ---
  if (dst === "(HL)" && isReg8(src)) {
    const opcode = 0x70 | regCode(src);
    ctx.texts.push({ addr: ctx.loc, data: [opcode] });
    ctx.loc += 1;
    return;
  }

  // --- LD r,(IX+d)/(IY+d) ---
  if (isReg8(dst)) {
    const idx = parseIndexAddr(ctx, src);
    if (idx) {
      ctx.texts.push({ addr: ctx.loc, data: [idx.prefix, 0x46 | (regCode(dst) << 3), idx.disp] });
      ctx.loc += 3;
      return;
    }
  }

  // --- LD (IX+d),r ---
  {
    const idx = parseIndexAddr(ctx, dst);
    if (idx && isReg8(src)) {
      ctx.texts.push({ addr: ctx.loc, data: [idx.prefix, 0x70 | regCode(src), idx.disp] });
      ctx.loc += 3;
      return;
    }
  }

  // --- I/R レジスタ転送 ---
  if (
    (dst === "A" && (src === "I" || src === "R")) ||
    ((dst === "I" || dst === "R") && src === "A")
  ) {
    const table: Record<string, number> = {
      "A,I": 0x57,
      "A,R": 0x5f,
      "I,A": 0x47,
      "R,A": 0x4f,
    };
    const key = `${dst},${src}`;
    const code = table[key];
    ctx.texts.push({ addr: ctx.loc, data: [0xed, code] });
    ctx.loc += 2;
    return;
  }

  // --- LD r,imm8 ---
  if (isReg8(dst) && isImm8(ctx, src)) {
    const val = resolveValue(ctx, src)!;
    ctx.texts.push({
      addr: ctx.loc,
      data: [0x06 | (regCode(dst) << 3), val & 0xff],
    });
    ctx.loc += 2;
    return;
  }

  // --- 16bit LD ---
  if (isReg16(dst) && isImm16(ctx, src)) {
    return encodeLD_rrnn(ctx, dst, src);
  }
  if (dst === "HL" && isMemAddress(src)) {
    return encodeLD_HLnn(ctx, src.slice(1, -1));
  }
  if (isMemAddress(dst) && src === "HL") {
    return encodeLD_nnHL(ctx, dst.slice(1, -1));
  }
  if (dst === "SP" && src === "HL") {
    return encodeLD_SP_HL(ctx);
  }

  // --- LD A,(nn) ---
  if (dst === "A" && isAbs16(src)) {
    return encodeLD_Ann(ctx, src);
  }

  // --- LD (nn),A ---
  if (src === "A" && isAbs16(dst)) {
    return encodeLD_nnA(ctx, dst);
  }

  // --- LD IX,nn / LD IY,nn ---
  if ((dst === "IX" || dst === "IY") && isImm16(ctx, src)) {
    const val = resolveValue(ctx, src)!;
    const prefix = dst === "IX" ? 0xdd : 0xfd;
    ctx.texts.push({
      addr: ctx.loc,
      data: [prefix, 0x21, val & 0xff, (val >> 8) & 0xff],
    });
    ctx.loc += 4;
    return;
  }

  throw new Error(`Unsupported LD form at line ${node.line}`);
}

// --- 8bit LD: A,(nn) ---
function encodeLD_Ann(ctx: AsmContext, src: string) {
  const val = resolveValue(ctx, src);
  if (val === null) {
    ctx.texts.push({ addr: ctx.loc, data: [0x3a, 0x00, 0x00] });
    ctx.unresolved.push({ addr: ctx.loc + 1, symbol: src, size: 2 });
  } else {
    ctx.texts.push({
      addr: ctx.loc,
      data: [0x3a, val & 0xff, (val >> 8) & 0xff],
    });
  }
  ctx.loc += 3;
}

// --- 8bit LD: (nn),A ---
function encodeLD_nnA(ctx: AsmContext, addrExpr: string) {
  const val = resolveValue(ctx, addrExpr);
  if (val === null) {
    ctx.texts.push({ addr: ctx.loc, data: [0x32, 0x00, 0x00] });
    ctx.unresolved.push({ addr: ctx.loc + 1, symbol: addrExpr, size: 2 });
  } else {
    ctx.texts.push({
      addr: ctx.loc,
      data: [0x32, val & 0xff, (val >> 8) & 0xff],
    });
  }
  ctx.loc += 3;
}

// --- 16bit LD: rr,nn ---
function encodeLD_rrnn(ctx: AsmContext, dst: string, src: string) {
  const val = resolveValue(ctx, src)!;
  const regPairTable: Record<string, number> = { BC: 0, DE: 1, HL: 2, SP: 3 };
  const opcode = 0x01 | (regPairTable[dst] << 4);
  ctx.texts.push({
    addr: ctx.loc,
    data: [opcode, val & 0xff, (val >> 8) & 0xff],
  });
  ctx.loc += 3;
}

// --- 16bit LD: HL,(nn) ---
function encodeLD_HLnn(ctx: AsmContext, addrExpr: string) {
  const val = resolveValue(ctx, addrExpr);
  if (val === null) {
    ctx.texts.push({ addr: ctx.loc, data: [0x2a, 0x00, 0x00] });
    ctx.unresolved.push({ addr: ctx.loc + 1, symbol: addrExpr, size: 2 });
  } else {
    ctx.texts.push({
      addr: ctx.loc,
      data: [0x2a, val & 0xff, (val >> 8) & 0xff],
    });
  }
  ctx.loc += 3;
}

// --- 16bit LD: (nn),HL ---
function encodeLD_nnHL(ctx: AsmContext, addrExpr: string) {
  const val = resolveValue(ctx, addrExpr);
  if (val === null) {
    ctx.texts.push({ addr: ctx.loc, data: [0x22, 0x00, 0x00] });
    ctx.unresolved.push({ addr: ctx.loc + 1, symbol: addrExpr, size: 2 });
  } else {
    ctx.texts.push({
      addr: ctx.loc,
      data: [0x22, val & 0xff, (val >> 8) & 0xff],
    });
  }
  ctx.loc += 3;
}

// --- 16bit LD: SP,HL ---
function encodeLD_SP_HL(ctx: AsmContext) {
  ctx.texts.push({ addr: ctx.loc, data: [0xf9] });
  ctx.loc += 1;
}

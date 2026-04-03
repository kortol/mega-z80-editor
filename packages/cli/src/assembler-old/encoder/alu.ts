import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { OperandInfo } from "../operand/classifyOperand";
import { OperandKind } from "../operand/operandKind";
import { NodeInstr } from "../parser";
import { InstrDef } from "./types";
import { reg8Info, regCode, reg16Code, resolveExpr8, isReg8, resolveValue, isImm8 } from "./utils";

// 各 ALU 命令の基本オペコード
function baseOpcode(op: string): number {
  switch (op) {
    case "ADD": return 0x80;
    case "ADC": return 0x88;
    case "SUB": return 0x90;
    case "SBC": return 0x98;
    case "AND": return 0xA0;
    case "XOR": return 0xA8;
    case "OR": return 0xB0;
    case "CP": return 0xB8;
    default: throw new Error(`Unknown ALU op ${op}`);
  }
}

// 即値オペコード
function immOpcode(op: string): number {
  switch (op) {
    case "ADD": return 0xC6;
    case "ADC": return 0xCE;
    case "SUB": return 0xD6;
    case "SBC": return 0xDE;
    case "AND": return 0xE6;
    case "XOR": return 0xEE;
    case "OR": return 0xF6;
    case "CP": return 0xFE;
    default: throw new Error(`Unknown ALU op ${op}`);
  }
}

export function makeALUDefs(op: string, opts?: { has16bit?: boolean; allowImplicitA?: boolean }): InstrDef[] {
  const defs: InstrDef[] = [];
  const base = baseOpcode(op);
  const imm = immOpcode(op);

  // --- A, n ---
  defs.push({
    match: (ctx, [dst, src]) =>
      !!dst && !!src &&
      dst.kind === OperandKind.REG8 && dst.raw === "A" &&
      (src.kind === OperandKind.IMM || src.kind === OperandKind.EXPR),
    encode(ctx, [dst, src], node) {
      const val = resolveExpr8(ctx, src.raw, node.pos);
      emitBytes(ctx, [imm, val & 0xff], node.pos);
    },
    estimate: 2,
  });

  // --- n (暗黙A) ---
  if (opts?.allowImplicitA) {
    defs.push({
      match: (ctx, [src]) =>
        src.kind === OperandKind.IMM || src.kind === OperandKind.EXPR,
      encode(ctx, [src], node) {
        const val = resolveExpr8(ctx, src.raw, node.pos);
        emitBytes(ctx, [imm, val & 0xff], node.pos);
      },
      estimate: 2,
    });
  }

  // --- A,r ---
  defs.push({
    match: (ctx, [dst, src]) =>
      !!dst && !!src &&
      dst.kind === OperandKind.REG8 && dst.raw === "A" &&
      (src.kind === OperandKind.REG8 || src.kind === OperandKind.REG8X),
    encode(ctx, [dst, src], node) {
      const info = reg8Info(src.raw);
      if (!info) throw new Error(`Invalid ALU operand ${src.raw}`);
      const opcode = base | info.code;
      emitBytes(ctx, info.prefix ? [info.prefix, opcode] : [opcode], node.pos);
    },
  });

  // --- A,(IX+d)/(IY+d) ---
  defs.push({
    match: (ctx, [dst, src]) =>
      !!dst && !!src &&
      dst.kind === OperandKind.REG8 && dst.raw === "A" &&
      src.kind === OperandKind.IDX,
    encode(ctx, [dst, src], node) {
      const prefix = src.raw.startsWith("(IX") ? 0xdd : 0xfd;
      const disp = (src.disp ?? 0) & 0xff;
      emitBytes(ctx, [prefix, base | 0x06, disp], node.pos);
    },
    estimate: 3,
  });

  // --- r (暗黙A) ---
  if (opts?.allowImplicitA) {
    defs.push({
      match: (ctx, [src]) =>
        src.kind === OperandKind.REG8 || src.kind === OperandKind.REG8X,
      encode(ctx, [src], node) {
        const info = reg8Info(src.raw);
        if (!info) throw new Error(`Invalid ALU operand ${src.raw}`);
        const opcode = base | info.code;
        emitBytes(ctx, info.prefix ? [info.prefix, opcode] : [opcode], node.pos);
      },
    });

    // --- (IX+d)/(IY+d) (暗黙A) ---
    defs.push({
      match: (ctx, [src]) => src.kind === OperandKind.IDX,
      encode(ctx, [src], node) {
        const prefix = src.raw.startsWith("(IX") ? 0xdd : 0xfd;
        const disp = (src.disp ?? 0) & 0xff;
        emitBytes(ctx, [prefix, base | 0x06, disp], node.pos);
      },
      estimate: 3,
    });
  }

  // --- 16bit版 ---
  if (opts?.has16bit) {
    defs.push({
      match: (ctx, [dst, src]) =>
        !!dst && !!src &&
        dst.kind === OperandKind.REG16 && dst.raw === "HL" &&
        src.kind === OperandKind.REG16,
      encode(ctx, [dst, src], node) {
        const code = reg16Code(src.raw);
        if (op === "ADC") {
          const table: Record<string, number> = { BC: 0x4a, DE: 0x5a, HL: 0x6a, SP: 0x7a };
          emitBytes(ctx, [0xed, table[src.raw]], node.pos);
          return;
        }
        if (op === "SBC") {
          const table: Record<string, number> = { BC: 0x42, DE: 0x52, HL: 0x62, SP: 0x72 };
          emitBytes(ctx, [0xed, table[src.raw]], node.pos);
          return;
        }
        emitBytes(ctx, [0x09 | (code << 4)], node.pos);
      },
    });

    // --- ADD IX/IY,rr ---
    if (op === "ADD") {
      defs.push({
        match: (ctx, [dst, src]) =>
          !!dst && !!src &&
          dst.kind === OperandKind.REG16X &&
          (src.kind === OperandKind.REG16 || src.kind === OperandKind.REG16X) &&
          (
            ["BC", "DE", "SP"].includes(src.raw) ||
            (src.kind === OperandKind.REG16X && src.raw === dst.raw)
          ),
        encode(ctx, [dst, src], node) {
          const prefix = dst.raw === "IX" ? 0xdd : 0xfd;
          const table: Record<string, number> = {
            BC: 0x09,
            DE: 0x19,
            IX: 0x29,
            IY: 0x29,
            SP: 0x39,
          };
          const opcode = table[src.raw];
          emitBytes(ctx, [prefix, opcode], node.pos);
        },
        estimate: 2,
      });
    }
  }

  // --- Fallback: unsupported ALU form ---
  defs.push({
    match: () => true,
    encode(ctx, args, node) {
      const text = args.map(a => a.raw).join(",");
      const forms: string[] = [
        `${op} A,r`,
        `${op} A,(HL)`,
        `${op} A,(IX/IY+d)`,
        `${op} A,n`,
      ];
      if (opts?.allowImplicitA) {
        forms.push(`${op} r`, `${op} (HL)`, `${op} (IX/IY+d)`, `${op} n`);
      }
      if (opts?.has16bit) {
        forms.push(`${op} HL,BC/DE/HL/SP`);
        if (op === "ADD") {
          forms.push(`${op} IX,BC/DE/IX/SP`);
          forms.push(`${op} IY,BC/DE/IY/SP`);
        }
      }
      throw new Error(`Unsupported ${op} form '${text}' (allowed: ${forms.join("; ")})`);
    },
  });

  return defs;
}

/**
 * 共通: 8bit ALU演算
 */
function encodeALU(
  ctx: AsmContext,
  node: NodeInstr,
  base: number,      // A,r の基本オペコード (下位3bitが r)
  immOpcode: number, // 即値
  hlOpcode: number   // (HL)
) {
  let dst = "A";
  let src: string;

  if (node.args.length === 1) {
    src = node.args[0]; // 短縮形: AND C / CP 1
  } else if (node.args.length === 2) {
    dst = node.args[0]; // 拡張形: AND A,C
    src = node.args[1];
    if (dst !== "A") {
      throw new Error(`Unsupported ${node.op} form at line ${node.pos.line}`);
    }
  } else {
    throw new Error(`Unsupported ${node.op} form at line ${node.pos.line}`);
  }

  // --- レジスタ版
  if (isReg8(src)) {
    const opcode = base | regCode(src);
    emitBytes(ctx, [opcode], node.pos);
    return;
  }
  // --- (HL)版
  if (src === "(HL)") {
    emitBytes(ctx, [hlOpcode], node.pos);
    return;
  }
  // --- 即値版
  if (isImm8(ctx, src)) {
    const val = resolveValue(ctx, src);
    if (val === null) {
      // 未解決シンボル
      emitBytes(ctx, [immOpcode, 0x00], node.pos);
      ctx.unresolved.push({
        addr: ctx.loc + 1, symbol: src, size: 1, requester: {
          op: node.op,
          phase: "assemble",
          pos: node.pos,
        },
      });
    } else {
      emitBytes(ctx, [immOpcode, val & 0xff], node.pos);
    }
    return;
  }
  throw new Error(`Unsupported ${node.op} form at line ${node.pos.line}`);
}

/**
 * ADD
 */
function encodeADD(ctx: AsmContext, node: NodeInstr) {
  const [dst, src] = node.args;
  if (dst === "A") {
    return encodeALU(ctx, node, 0x80, 0xc6, 0x86);
  }
  // 16bit: ADD HL,ss
  if (dst === "HL" && ["BC", "DE", "HL", "SP"].includes(src)) {
    const table: Record<string, number> = { BC: 0x09, DE: 0x19, HL: 0x29, SP: 0x39 };
    emitBytes(ctx, [table[src]], node.pos);
    return;
  }
  // 16bit: ADD IX,rr
  if (dst === "IX" && ["BC", "DE", "IX", "SP"].includes(src)) {
    const table: Record<string, number> = { BC: 0x09, DE: 0x19, IX: 0x29, SP: 0x39 };
    emitBytes(ctx, [0xdd, table[src]], node.pos);
    return;
  }
  // 16bit: ADD IY,rr
  if (dst === "IY" && ["BC", "DE", "IY", "SP"].includes(src)) {
    const table: Record<string, number> = { BC: 0x09, DE: 0x19, IY: 0x29, SP: 0x39 };
    emitBytes(ctx, [0xfd, table[src]], node.pos);
    return;
  }
  throw new Error(`Unsupported ADD form at line ${node.pos.line}`);
}

/**
 * ADC
 */
function encodeADC(ctx: AsmContext, node: NodeInstr) {
  if (node.args[0] === "A") {
    return encodeALU(ctx, node, 0x88, 0xce, 0x8e);
  }
  throw new Error(`Unsupported ADC form at line ${node.pos.line}`);
}

/**
 * SUB
 */
function encodeSUB(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0x90, 0xd6, 0x96);
}

/**
 * SBC
 */
function encodeSBC(ctx: AsmContext, node: NodeInstr) {
  if (node.args[0] === "A") {
    return encodeALU(ctx, node, 0x98, 0xde, 0x9e);
  }
  throw new Error(`Unsupported SBC form at line ${node.pos.line}`);
}

/**
 * AND
 */
function encodeAND(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0xa0, 0xe6, 0xa6);
}

/**
 * OR
 */
function encodeOR(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0xb0, 0xf6, 0xb6);
}

/**
 * XOR
 */
function encodeXOR(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0xa8, 0xee, 0xae);
}

/**
 * CP
 */
function encodeCP(ctx: AsmContext, node: NodeInstr) {
  return encodeALU(ctx, node, 0xb8, 0xfe, 0xbe);
}

export {
  encodeADD,
  encodeADC,
  encodeSUB,
  encodeSBC,
  encodeAND,
  encodeOR,
  encodeXOR,
  encodeCP,
};

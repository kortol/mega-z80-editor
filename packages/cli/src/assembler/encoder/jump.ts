import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { AssemblerErrorCode } from "../errors";
import { OperandKind } from "../operand/operandKind";
import { NodeInstr } from "../parser";
import { InstrDef } from "./types";
import { resolveExpr8, resolveExpr16 } from "./utils";

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

// ====================================================================
// JP 命令群
// ====================================================================
export const JPInstrDefs: InstrDef[] = [
  // JP (HL)/(IX)/(IY)
  {
    match: (ctx, args) =>
      args.length === 1 &&
      (
        (args[0].kind === OperandKind.IDX && ["(IX)", "(IY)"].includes(args[0].raw.toUpperCase())) ||
        (args[0].kind === OperandKind.REG_IND && "(HL)" === args[0].raw.toUpperCase())
      ),
    encode(ctx, args, node) {
      // console.log("JP (HL)");
      const t = args[0].raw.toUpperCase();
      if (t === "(HL)") emitBytes(ctx, [0xE9], node.line);
      else if (t === "(IX)") emitBytes(ctx, [0xDD, 0xE9], node.line);
      else emitBytes(ctx, [0xFD, 0xE9]), node.line;
      ctx.loc += ctx.texts.at(-1)!.data.length;
    },
    estimate: (ctx, args) => (args[0].raw.toUpperCase() === "(HL)" ? 1 : 2),
  },
  // JP cc,nn
  {
    match: (ctx, args) =>
      args.length === 2 && condCodes.hasOwnProperty(args[0].raw.toUpperCase()),
    encode(ctx, args, node) {
      const cond = args[0].raw.toUpperCase();
      const val = resolveExpr16(ctx, args[1].raw, node.line, true);
      const opcode = 0xC2 | condCodes[cond];
      emitBytes(ctx, [opcode, val & 0xFF, val >> 8], node.line);
    },
    estimate: 3,
  },
  // JP nn
  {
    match: (ctx, args) => args.length === 1,
    encode(ctx, args, node) {
      // console.log("JP NN");
      const val = resolveExpr16(ctx, args[0].raw, node.line, true);
      emitBytes(ctx, [0xC3, val & 0xFF, val >> 8], node.line);
    },
    estimate: 3,
  },
];

// ====================================================================
// JR 命令群
// ====================================================================
export const JRInstrDefs: InstrDef[] = [
  // JR cc,offset
  {
    match: (ctx, args) =>
      args.length === 2 && condCodes.hasOwnProperty(args[0].raw.toUpperCase()),
    encode(ctx, args, node) {
      const cond = args[0].raw.toUpperCase();
      const target = args[1].raw;

      // ★ 16bit絶対値として評価（$含む式OK）
      const val = resolveExpr16(ctx, target, node.line, false, false);
      if (ctx.errors.length > 0) return;

      // ★ offset計算（target - (loc + 2)）
      const offset = val - (ctx.loc + 2);

      // ★ 範囲チェック
      if (offset < -128 || offset > 127) {
        ctx.errors.push({
          code: AssemblerErrorCode.ExprNotConstant,
          message: `JR target out of range (${offset}) at line ${node.line}`,
          line: node.line,
        });
        return;
      }

      const opcode = { NZ: 0x20, Z: 0x28, NC: 0x30, C: 0x38 }[cond];
      emitBytes(ctx, [opcode ?? 0, offset & 0xff], node.line);
    },
    estimate: 2,
  },
  // JR offset
  {
    match: (ctx, args) => args.length === 1,
    encode(ctx, args, node) {
      const target = args[0].raw;

      const val = resolveExpr16(ctx, target, node.line, false, false);
      if (ctx.errors.length > 0) return;

      const offset = val - (ctx.loc + 2);

      if (offset < -128 || offset > 127) {
        ctx.errors.push({
          code: AssemblerErrorCode.ExprNotConstant,
          message: `JR target out of range (${offset}) at line ${node.line}`,
          line: node.line,
        });
        return;
      }

      emitBytes(ctx, [0x18, offset & 0xff], node.line);
    },
    estimate: 2,
  },
];

// ====================================================================
// CALL 命令群
// ====================================================================
export const CALLInstrDefs: InstrDef[] = [
  // CALL cc,nn
  {
    match: (ctx, args) =>
      args.length === 2 && condCodes.hasOwnProperty(args[0].raw.toUpperCase()),
    encode(ctx, args, node) {
      const cond = args[0].raw.toUpperCase();
      const val = resolveExpr16(ctx, args[1].raw, node.line, true);
      const opcode = 0xC4 | condCodes[cond];
      emitBytes(ctx, [opcode, val & 0xFF, val >> 8], node.line);
    },
    estimate: 3,
  },
  // CALL nn
  {
    match: (ctx, args) => args.length === 1,
    encode(ctx, args, node) {
      const val = resolveExpr16(ctx, args[0].raw, node.line, true);
      emitBytes(ctx, [0xCD, val & 0xFF, val >> 8], node.line);
    },
    estimate: 3,
  },
];

// ====================================================================
// RET / RST / DJNZ
// ====================================================================
export const RETInstrDefs: InstrDef[] = [
  // RET cc
  {
    match: (ctx, args) =>
      args.length === 1 && condCodes.hasOwnProperty(args[0].raw.toUpperCase()),
    encode(ctx, args, node) {
      const cond = args[0].raw.toUpperCase();
      emitBytes(ctx, [0xC0 | condCodes[cond]], node.line);
    },
  },
  // RET
  {
    match: (ctx, args) => args.length === 0,
    encode(ctx, args, node) {
      emitBytes(ctx, [0xC9], node.line);
    },
  },
];

export const RSTInstrDefs: InstrDef[] = [
  {
    match: (ctx, args) => args.length === 1,
    encode(ctx, args, node) {
      const val = resolveExpr8(ctx, args[0].raw, node.line, true);
      if (val % 8 !== 0 || val < 0 || val > 0x38)
        throw new Error(`Invalid RST vector ${val}`);
      emitBytes(ctx, [0xC7 + val], node.line);
    },
  },
];

export const DJNZInstrDefs: InstrDef[] = [
  {
    match: (ctx, args) => args.length === 1,
    encode(ctx, args, node) {
      const target = args[0].raw;

      // ★ 16bit絶対値として評価（$もOK）
      const val = resolveExpr16(ctx, target, node.line, false, false);
      if (ctx.errors.length > 0) return;

      // ★ offset計算（target - (loc + 2)）
      const offset = val - (ctx.loc + 2);

      // ★ 範囲チェック
      if (offset < -128 || offset > 127) {
        ctx.errors.push({
          code: AssemblerErrorCode.ExprNotConstant,
          message: `DJNZ target out of range (${offset}) at line ${node.line}`,
          line: node.line,
        });
        return;
      }

      emitBytes(ctx, [0x10, offset & 0xff], node.line);
    },
    estimate: 2,
  },
];
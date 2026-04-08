import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { NodeInstr } from "../node";
import { classifyOperand } from "../operand/classifyOperand";
import { OperandKind } from "../operand/operandKind";
import { InstrDef } from "./types";

export const exInstr: InstrDef[] = [
  // EX AF,AF'
  {
    match: (_ctx, args) =>
      args.length === 2 &&
      ((args[0].raw === "AF" && (args[1].raw === "AF'" || args[1].raw === "AF")) ||
        (args[0].raw === "AF'" && (args[1].raw === "AF" || args[1].raw === "AF'"))),
    encode(ctx, _args, node) {
      emitBytes(ctx, [0x08], node.pos);
    },
    estimate: 1,
  },

  // EX DE,HL
  {
    match: (_ctx, args) =>
      args.length === 2 &&
      args[0].kind === OperandKind.REG16 &&
      args[1].kind === OperandKind.REG16 &&
      ((args[0].raw === "DE" && args[1].raw === "HL") || (args[0].raw === "HL" && args[1].raw === "DE")),
    encode(ctx, _args, node) {
      emitBytes(ctx, [0xeb], node.pos);
    },
    estimate: 1,
  },

  // EX (SP),HL
  {
    match: (_ctx, args) =>
      args.length === 2 &&
      ((args[0].kind === OperandKind.REG_IND && args[0].raw === "(SP)" && args[1].kind === OperandKind.REG16 && args[1].raw === "HL") ||
        (args[1].kind === OperandKind.REG_IND && args[1].raw === "(SP)" && args[0].kind === OperandKind.REG16 && args[0].raw === "HL")),
    encode(ctx, _args, node) {
      emitBytes(ctx, [0xe3], node.pos);
    },
    estimate: 1,
  },

  // EX (SP),IX/IY
  {
    match: (_ctx, args) =>
      args.length === 2 &&
      ((args[0].kind === OperandKind.REG_IND && args[0].raw === "(SP)" && args[1].kind === OperandKind.REG16X && (args[1].raw === "IX" || args[1].raw === "IY")) ||
        (args[1].kind === OperandKind.REG_IND && args[1].raw === "(SP)" && args[0].kind === OperandKind.REG16X && (args[0].raw === "IX" || args[0].raw === "IY"))),
    encode(ctx, args, node) {
      const reg = args[0].kind === OperandKind.REG16X ? args[0].raw : args[1].raw;
      const prefix = reg === "IX" ? 0xdd : 0xfd;
      emitBytes(ctx, [prefix, 0xe3], node.pos);
    },
    estimate: 2,
  },

  {
    match: () => true,
    encode(_ctx, args) {
      throw new Error(
        `Unsupported EX form '${args[0]?.raw ?? ""},${args[1]?.raw ?? ""}' (allowed: AF,AF' / DE,HL / (SP),HL/IX/IY)`
      );
    },
    estimate: 1,
  },
];

export function encodeEX(ctx: AsmContext, node: NodeInstr) {
  const args = node.args.map(s => classifyOperand(ctx, s));
  for (const def of exInstr) {
    if (def.match(ctx, args)) {
      def.encode(ctx, args, node);
      return;
    }
  }
  throw new Error(`Unsupported EX form at line ${node.pos.line}`);
}

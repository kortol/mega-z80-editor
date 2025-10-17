import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { NodeInstr } from "../parser";
import { regCode } from "./utils";

/**
 * CB prefix instructions
 */
export function encodeCB(ctx: AsmContext, node: NodeInstr) {
  const op = node.op.toUpperCase();
  const args = node.args;

  // --- シフト/ローテート系 (1引数: レジスタ or (HL))
  const rotMap: Record<string, number> = {
    RLC: 0x00,
    RRC: 0x08,
    RL: 0x10,
    RR: 0x18,
    SLA: 0x20,
    SRA: 0x28,
    SLL: 0x30, // undocumented
    SRL: 0x38,
  };

  if (op in rotMap) {
    if (args.length !== 1) throw new Error(`${op} requires 1 operand`);
    const r = args[0];
    const reg = regCode(r);
    emitBytes(ctx, [0xCB, rotMap[op] | reg], node.pos);
    return;
  }

  // --- BIT/RES/SET (bit, r)
  if (["BIT", "RES", "SET"].includes(op)) {
    if (args.length !== 2) throw new Error(`${op} requires 2 operands`);
    const bit = parseInt(args[0], 10);
    if (isNaN(bit) || bit < 0 || bit > 7) {
      throw new Error(`${op} bit index out of range: ${args[0]}`);
    }
    const r = args[1];
    const reg = regCode(r);
    const base = op === "BIT" ? 0x40 : op === "RES" ? 0x80 : 0xC0; // SET
    emitBytes(ctx, [0xCB, base | (bit << 3) | reg], node.pos);
    return;
  }

  throw new Error(`Unsupported CB instruction ${op} at line ${node.pos.line}`);
}

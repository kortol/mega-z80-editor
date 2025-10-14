import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { NodeInstr } from "../parser";
import { regCode, reg16Code, isReg8 } from "./utils";

export function encodeINC(ctx: AsmContext, node: NodeInstr) {
  const r = node.args[0];
  if (isReg8(r)) {
    const opcode = 0x04 | (regCode(r) << 3);
    emitBytes(ctx, [opcode], node.line);
    return;
  }
  if (["BC", "DE", "HL", "SP"].includes(r)) {
    const opcode = 0x03 | (reg16Code(r) << 4);
    emitBytes(ctx, [opcode], node.line);
    return;
  }
  throw new Error(`Unsupported INC form at line ${node.line}`);
}

export function encodeDEC(ctx: AsmContext, node: NodeInstr) {
  const r = node.args[0];
  if (isReg8(r)) {
    const opcode = 0x05 | (regCode(r) << 3);
    emitBytes(ctx, [opcode], node.line);
    return;
  }
  if (["BC", "DE", "HL", "SP"].includes(r)) {
    const opcode = 0x0b | (reg16Code(r) << 4);
    emitBytes(ctx, [opcode], node.line);
    return;
  }
  throw new Error(`Unsupported DEC form at line ${node.line}`);
}

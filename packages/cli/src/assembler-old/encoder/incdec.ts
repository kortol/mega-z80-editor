import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { NodeInstr } from "../parser";
import { parseIndexAddr, reg8Info, regCode, reg16Code, isReg8 } from "./utils";

export function encodeINC(ctx: AsmContext, node: NodeInstr) {
  const r = node.args[0];
  {
    const info = reg8Info(r);
    if (info) {
      const opcode = 0x04 | (info.code << 3);
      if (info.prefix) {
        emitBytes(ctx, [info.prefix, opcode], node.pos);
      } else {
        emitBytes(ctx, [opcode], node.pos);
      }
      return;
    }
  }
  if (r === "(HL)") {
    emitBytes(ctx, [0x34], node.pos);
    return;
  }
  const idx = parseIndexAddr(ctx, r);
  if (idx) {
    emitBytes(ctx, [idx.prefix, 0x34, idx.disp], node.pos);
    return;
  }
  if (["BC", "DE", "HL", "SP"].includes(r)) {
    const opcode = 0x03 | (reg16Code(r) << 4);
    emitBytes(ctx, [opcode], node.pos);
    return;
  }
  if (r === "IX" || r === "IY") {
    const prefix = r === "IX" ? 0xdd : 0xfd;
    emitBytes(ctx, [prefix, 0x23], node.pos);
    return;
  }
  throw new Error(`Unsupported INC form at line ${node.pos.line}`);
}

export function encodeDEC(ctx: AsmContext, node: NodeInstr) {
  const r = node.args[0];
  {
    const info = reg8Info(r);
    if (info) {
      const opcode = 0x05 | (info.code << 3);
      if (info.prefix) {
        emitBytes(ctx, [info.prefix, opcode], node.pos);
      } else {
        emitBytes(ctx, [opcode], node.pos);
      }
      return;
    }
  }
  if (r === "(HL)") {
    emitBytes(ctx, [0x35], node.pos);
    return;
  }
  const idx = parseIndexAddr(ctx, r);
  if (idx) {
    emitBytes(ctx, [idx.prefix, 0x35, idx.disp], node.pos);
    return;
  }
  if (["BC", "DE", "HL", "SP"].includes(r)) {
    const opcode = 0x0b | (reg16Code(r) << 4);
    emitBytes(ctx, [opcode], node.pos);
    return;
  }
  if (r === "IX" || r === "IY") {
    const prefix = r === "IX" ? 0xdd : 0xfd;
    emitBytes(ctx, [prefix, 0x2b], node.pos);
    return;
  }
  throw new Error(`Unsupported DEC form at line ${node.pos.line}`);
}

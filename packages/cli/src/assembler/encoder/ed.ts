import { emitBytes } from "../codegen/emit";
import { AsmContext } from "../context";
import { NodeInstr } from "../parser";

export function encodeED(ctx: AsmContext, node: NodeInstr) {
  const op = node.op.toUpperCase();
  const args = node.args.map((a) => a.toUpperCase());

  // 単純マップ
  const table: Record<string, number> = {
    LDI: 0xA0,
    LDIR: 0xB0,
    LDD: 0xA8,
    LDDR: 0xB8,
    NEG: 0x44,
    RETN: 0x45,
    RETI: 0x4D,
    RRD: 0x67,
    RLD: 0x6F,
  };

  if (op in table && args.length === 0) {
    emitBytes(ctx, [0xED, table[op]], node.line);
    return;
  }

  // LD A,I / LD A,R / LD I,A / LD R,A
  const ldTable: Record<string, number> = {
    "LD A,I": 0x57,
    "LD A,R": 0x5F,
    "LD I,A": 0x47,
    "LD R,A": 0x4F,
  };
  const key = [op, ...args].join(" ");
  if (ldTable[key]) {
    emitBytes(ctx, [0xED, ldTable[op]], node.line);
    return;
  }

  // IM n
  if (op === "IM") {
    if (args.length !== 1) throw new Error("IM requires one argument");
    const mode = parseInt(args[0], 10);
    const codes = [0x46, 0x56, 0x5E];
    if (isNaN(mode) || mode < 0 || mode > 2) {
      throw new Error(`Invalid IM mode: ${args[0]}`);
    }
    emitBytes(ctx, [0xED, codes[mode]], node.line);
    return;
  }

  throw new Error(`Unsupported ED instruction ${op} ${args.join(",")}`);
}

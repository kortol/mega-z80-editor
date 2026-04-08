// packages\cli\src\assembler\encoder.ts
import { AsmContext } from "./context";
import { NodeInstr } from "./node";
import { instrTable } from "./encoder/instrTable";
import { classifyOperand } from "./operand/classifyOperand";

const parserOpcodeExcludes = new Set([
  "MULUB", "MULUW", "SLP", "MLT", "IN0", "OUT0", "INO", "OUTO",
  "OTIM", "OTIMR", "OTDM", "OTDMR", "TSTIO", "TST",
  "MULT", "MULTU", "MULTW", "DIV", "DIVU", "JAF", "JAR", "LDUP", "LOUD",
]);

// --- 命令長の見積もり ---
export function estimateInstrSize(ctx: AsmContext, node: NodeInstr): number {
  const defs = instrTable[node.op];
  const operand = node.args.map(s => classifyOperand(ctx, s))
  if (defs) {
    for (const def of defs) {
      if (def.match(ctx, operand)) {
        if (typeof def.estimate === "function") {
          return def.estimate(ctx, operand, node);
        } else {
          return def.estimate ?? 1;
        }
      }
    }
  }
  return 1;
}

export function encodeInstr(ctx: AsmContext, node: NodeInstr) {
  const defs = instrTable[node.op];
  const operand = node.args.map(s => classifyOperand(ctx, s));
  if (defs) {
    for (const def of defs) {
      if (def.match(ctx, operand)) {
        return def.encode(ctx, operand, node);
      }
    }
    const args = node.args.join(",");
    throw new Error(`Unsupported instruction form ${node.op}${args ? " " + args : ""} at line ${node.pos.line}`);
  }
  throw new Error(`Unsupported instruction ${node.op} at line ${node.pos.line}`);
}

export function getZ80OpcodeTable(): Map<string, any> {
  const table = new Map<string, any>();
  const keys = Object.keys(instrTable);
  for (const key of keys) {
    if (parserOpcodeExcludes.has(key.toUpperCase())) continue;
    table.set(key.toUpperCase(), instrTable[key]);
  }
  return table;
}

// packages\cli\src\assembler\encoder.ts
import { AsmContext, SectionState } from "./context";
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
        }
        if (typeof def.estimate === "number") return def.estimate;
        return estimateByDryRun(ctx, node, def, operand);
      }
    }
  }
  return 1;
}

function estimateByDryRun(ctx: AsmContext, node: NodeInstr, def: any, operand: any[]): number {
  const currentSection = ctx.sections.get(ctx.currentSection);
  if (!currentSection) return 1;

  const secClone: SectionState = {
    ...currentSection,
    bytes: [...(currentSection.bytes ?? [])],
    lc: ctx.loc,
  };

  const probe: AsmContext = {
    ...ctx,
    texts: [],
    unresolved: [],
    relocs: [],
    errors: [],
    warnings: [],
    sections: new Map([[ctx.currentSection, secClone]]),
    loc: ctx.loc,
  };

  try {
    def.encode(probe, operand, node);
    const sz = probe.loc - ctx.loc;
    return sz > 0 ? sz : 1;
  } catch {
    return 1;
  }
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

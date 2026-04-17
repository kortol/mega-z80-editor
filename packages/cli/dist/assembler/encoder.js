"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateInstrSize = estimateInstrSize;
exports.encodeInstr = encodeInstr;
exports.getZ80OpcodeTable = getZ80OpcodeTable;
const instrTable_1 = require("./encoder/instrTable");
const classifyOperand_1 = require("./operand/classifyOperand");
const parserOpcodeExcludes = new Set([
    "MULUB", "MULUW", "SLP", "MLT", "IN0", "OUT0", "INO", "OUTO",
    "OTIM", "OTIMR", "OTDM", "OTDMR", "TSTIO", "TST",
    "MULT", "MULTU", "MULTW", "DIV", "DIVU", "JAF", "JAR", "LDUP", "LOUD",
]);
// --- 命令長の見積もり ---
function estimateInstrSize(ctx, node) {
    const defs = instrTable_1.instrTable[node.op];
    const operand = node.args.map(s => (0, classifyOperand_1.classifyOperand)(ctx, s));
    if (defs) {
        for (const def of defs) {
            if (def.match(ctx, operand)) {
                if (typeof def.estimate === "function") {
                    return def.estimate(ctx, operand, node);
                }
                if (typeof def.estimate === "number")
                    return def.estimate;
                return estimateByDryRun(ctx, node, def, operand);
            }
        }
    }
    return 1;
}
function estimateByDryRun(ctx, node, def, operand) {
    const currentSection = ctx.sections.get(ctx.currentSection);
    if (!currentSection)
        return 1;
    const secClone = {
        ...currentSection,
        bytes: [...(currentSection.bytes ?? [])],
        lc: ctx.loc,
    };
    const probe = {
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
    }
    catch {
        return 1;
    }
}
function encodeInstr(ctx, node) {
    const defs = instrTable_1.instrTable[node.op];
    const operand = node.args.map(s => (0, classifyOperand_1.classifyOperand)(ctx, s));
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
function getZ80OpcodeTable() {
    const table = new Map();
    const keys = Object.keys(instrTable_1.instrTable);
    for (const key of keys) {
        if (parserOpcodeExcludes.has(key.toUpperCase()))
            continue;
        table.set(key.toUpperCase(), instrTable_1.instrTable[key]);
    }
    return table;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeED = encodeED;
const emit_1 = require("../codegen/emit");
function encodeED(ctx, node) {
    const op = node.op.toUpperCase();
    const args = node.args.map((a) => a.toUpperCase());
    // 単純マップ
    const table = {
        LDI: 0xA0,
        LDIR: 0xB0,
        LDD: 0xA8,
        LDDR: 0xB8,
        CPI: 0xA1,
        CPIR: 0xB1,
        CPD: 0xA9,
        CPDR: 0xB9,
        INI: 0xA2,
        INIR: 0xB2,
        IND: 0xAA,
        INDR: 0xBA,
        OUTI: 0xA3,
        OTIR: 0xB3,
        OUTD: 0xAB,
        OTDR: 0xBB,
        NEG: 0x44,
        RETN: 0x45,
        RETI: 0x4D,
        RRD: 0x67,
        RLD: 0x6F,
    };
    if (op in table && args.length === 0) {
        (0, emit_1.emitBytes)(ctx, [0xED, table[op]], node.pos);
        return;
    }
    // LD A,I / LD A,R / LD I,A / LD R,A
    const ldTable = {
        "LD A,I": 0x57,
        "LD A,R": 0x5F,
        "LD I,A": 0x47,
        "LD R,A": 0x4F,
    };
    const key = [op, ...args].join(" ");
    if (ldTable[key]) {
        (0, emit_1.emitBytes)(ctx, [0xED, ldTable[op]], node.pos);
        return;
    }
    // IM n
    if (op === "IM") {
        if (args.length !== 1)
            throw new Error("IM requires one argument");
        const mode = parseInt(args[0], 10);
        const codes = [0x46, 0x56, 0x5E];
        if (isNaN(mode) || mode < 0 || mode > 2) {
            throw new Error(`Invalid IM mode: ${args[0]}`);
        }
        (0, emit_1.emitBytes)(ctx, [0xED, codes[mode]], node.pos);
        return;
    }
    throw new Error(`Unsupported ED instruction ${op} ${args.join(",")}`);
}

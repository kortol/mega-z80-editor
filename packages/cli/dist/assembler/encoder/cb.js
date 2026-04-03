"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeCB = encodeCB;
const emit_1 = require("../codegen/emit");
const utils_1 = require("./utils");
/**
 * CB prefix instructions
 */
function encodeCB(ctx, node) {
    const op = node.op.toUpperCase();
    const args = node.args;
    // --- シフト/ローテート系 (1引数: レジスタ or (HL))
    const rotMap = {
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
        if (args.length !== 1)
            throw new Error(`${op} requires 1 operand`);
        const r = args[0];
        const idx = (0, utils_1.parseIndexAddr)(ctx, r);
        if (idx) {
            (0, emit_1.emitBytes)(ctx, [idx.prefix, 0xcb, idx.disp, rotMap[op] | 0x06], node.pos);
            return;
        }
        const reg = (0, utils_1.regCode)(r);
        (0, emit_1.emitBytes)(ctx, [0xCB, rotMap[op] | reg], node.pos);
        return;
    }
    // --- BIT/RES/SET (bit, r)
    if (["BIT", "RES", "SET"].includes(op)) {
        if (args.length !== 2)
            throw new Error(`${op} requires 2 operands`);
        const bit = parseInt(args[0], 10);
        if (isNaN(bit) || bit < 0 || bit > 7) {
            throw new Error(`${op} bit index out of range: ${args[0]}`);
        }
        const r = args[1];
        const idx = (0, utils_1.parseIndexAddr)(ctx, r);
        if (idx) {
            const base = op === "BIT" ? 0x40 : op === "RES" ? 0x80 : 0xC0;
            (0, emit_1.emitBytes)(ctx, [idx.prefix, 0xcb, idx.disp, base | (bit << 3) | 0x06], node.pos);
            return;
        }
        const reg = (0, utils_1.regCode)(r);
        const base = op === "BIT" ? 0x40 : op === "RES" ? 0x80 : 0xC0; // SET
        (0, emit_1.emitBytes)(ctx, [0xCB, base | (bit << 3) | reg], node.pos);
        return;
    }
    const supported = [
        "RLC/RRC/RL/RR/SLA/SRA/SLL/SRL r/(HL)/(IX/IY+d)",
        "BIT/RES/SET b,r/(HL)/(IX/IY+d)",
    ];
    throw new Error(`Unsupported CB instruction ${op} ${args.join(",")} (supported: ${supported.join("; ")})`);
}

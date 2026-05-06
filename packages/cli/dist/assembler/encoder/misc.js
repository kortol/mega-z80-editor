"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.miscInstr = void 0;
exports.encodeMisc = encodeMisc;
const emit_1 = require("../codegen/emit");
/**
 * 単発 Misc 命令
 */
function encodeMisc(ctx, node) {
    const opcodeTable = {
        NOP: 0x00,
        HALT: 0x76,
        DAA: 0x27,
        CPL: 0x2F,
        SCF: 0x37,
        CCF: 0x3F,
        DI: 0xF3,
        EI: 0xFB,
        RLCA: 0x07,
        RRCA: 0x0F,
        RLA: 0x17,
        RRA: 0x1F,
        EXX: 0xD9,
    };
    const opcode = opcodeTable[node.op.toUpperCase()];
    if (opcode === undefined) {
        throw new Error(`Unsupported misc instruction ${node.op}`);
    }
    (0, emit_1.emitBytes)(ctx, [opcode], node.pos);
}
exports.miscInstr = [
    {
        match: (_ctx, args) => args.length === 0,
        encode(ctx, _args, node) {
            encodeMisc(ctx, node);
        },
        estimate: 1,
    },
    {
        match: () => true,
        encode(_ctx, _args, node) {
            throw new Error(`Unsupported misc instruction ${node.op}`);
        },
        estimate: 1,
    },
];

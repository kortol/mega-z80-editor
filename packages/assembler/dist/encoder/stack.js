"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.popInstr = exports.pushInstr = void 0;
const emit_1 = require("../codegen/emit");
const operandKind_1 = require("../operand/operandKind");
function isPushPopReg(raw) {
    return ["BC", "DE", "HL", "AF", "IX", "IY"].includes(raw.toUpperCase());
}
function isIndexReg(raw) {
    return raw.toUpperCase() === "IX" || raw.toUpperCase() === "IY";
}
exports.pushInstr = [
    {
        match: (ctx, [op]) => !!op &&
            (op.kind === operandKind_1.OperandKind.REG16 || op.kind === operandKind_1.OperandKind.REG16X || op.kind === operandKind_1.OperandKind.REG_AF) &&
            isPushPopReg(op.raw),
        encode(ctx, [op], node) {
            const r = op.raw.toUpperCase();
            if (isIndexReg(r)) {
                const prefix = r === "IX" ? 0xdd : 0xfd;
                (0, emit_1.emitBytes)(ctx, [prefix, 0xe5], node.pos);
                return;
            }
            const table = {
                BC: 0xc5,
                DE: 0xd5,
                HL: 0xe5,
                AF: 0xf5,
            };
            const opcode = table[r];
            if (opcode === undefined)
                throw new Error(`Unsupported PUSH ${r}`);
            (0, emit_1.emitBytes)(ctx, [opcode], node.pos);
        },
        estimate: (ctx, [op]) => (op && isIndexReg(op.raw) ? 2 : 1),
    },
];
exports.popInstr = [
    {
        match: (ctx, [op]) => !!op &&
            (op.kind === operandKind_1.OperandKind.REG16 || op.kind === operandKind_1.OperandKind.REG16X || op.kind === operandKind_1.OperandKind.REG_AF) &&
            isPushPopReg(op.raw),
        encode(ctx, [op], node) {
            const r = op.raw.toUpperCase();
            if (isIndexReg(r)) {
                const prefix = r === "IX" ? 0xdd : 0xfd;
                (0, emit_1.emitBytes)(ctx, [prefix, 0xe1], node.pos);
                return;
            }
            const table = {
                BC: 0xc1,
                DE: 0xd1,
                HL: 0xe1,
                AF: 0xf1,
            };
            const opcode = table[r];
            if (opcode === undefined)
                throw new Error(`Unsupported POP ${r}`);
            (0, emit_1.emitBytes)(ctx, [opcode], node.pos);
        },
        estimate: (ctx, [op]) => (op && isIndexReg(op.raw) ? 2 : 1),
    },
];

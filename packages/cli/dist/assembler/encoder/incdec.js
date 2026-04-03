"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeINC = encodeINC;
exports.encodeDEC = encodeDEC;
const emit_1 = require("../codegen/emit");
const utils_1 = require("./utils");
function encodeINC(ctx, node) {
    const r = node.args[0];
    {
        const info = (0, utils_1.reg8Info)(r);
        if (info) {
            const opcode = 0x04 | (info.code << 3);
            if (info.prefix) {
                (0, emit_1.emitBytes)(ctx, [info.prefix, opcode], node.pos);
            }
            else {
                (0, emit_1.emitBytes)(ctx, [opcode], node.pos);
            }
            return;
        }
    }
    if (r === "(HL)") {
        (0, emit_1.emitBytes)(ctx, [0x34], node.pos);
        return;
    }
    const idx = (0, utils_1.parseIndexAddr)(ctx, r);
    if (idx) {
        (0, emit_1.emitBytes)(ctx, [idx.prefix, 0x34, idx.disp], node.pos);
        return;
    }
    if (["BC", "DE", "HL", "SP"].includes(r)) {
        const opcode = 0x03 | ((0, utils_1.reg16Code)(r) << 4);
        (0, emit_1.emitBytes)(ctx, [opcode], node.pos);
        return;
    }
    if (r === "IX" || r === "IY") {
        const prefix = r === "IX" ? 0xdd : 0xfd;
        (0, emit_1.emitBytes)(ctx, [prefix, 0x23], node.pos);
        return;
    }
    throw new Error(`Unsupported INC form at line ${node.pos.line}`);
}
function encodeDEC(ctx, node) {
    const r = node.args[0];
    {
        const info = (0, utils_1.reg8Info)(r);
        if (info) {
            const opcode = 0x05 | (info.code << 3);
            if (info.prefix) {
                (0, emit_1.emitBytes)(ctx, [info.prefix, opcode], node.pos);
            }
            else {
                (0, emit_1.emitBytes)(ctx, [opcode], node.pos);
            }
            return;
        }
    }
    if (r === "(HL)") {
        (0, emit_1.emitBytes)(ctx, [0x35], node.pos);
        return;
    }
    const idx = (0, utils_1.parseIndexAddr)(ctx, r);
    if (idx) {
        (0, emit_1.emitBytes)(ctx, [idx.prefix, 0x35, idx.disp], node.pos);
        return;
    }
    if (["BC", "DE", "HL", "SP"].includes(r)) {
        const opcode = 0x0b | ((0, utils_1.reg16Code)(r) << 4);
        (0, emit_1.emitBytes)(ctx, [opcode], node.pos);
        return;
    }
    if (r === "IX" || r === "IY") {
        const prefix = r === "IX" ? 0xdd : 0xfd;
        (0, emit_1.emitBytes)(ctx, [prefix, 0x2b], node.pos);
        return;
    }
    throw new Error(`Unsupported DEC form at line ${node.pos.line}`);
}

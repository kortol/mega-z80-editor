"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeEX = encodeEX;
const emit_1 = require("../codegen/emit");
/**
 * EX 命令群
 */
function encodeEX(ctx, node) {
    const [op1, op2] = node.args;
    // EX AF,AF'
    if ((op1 === "AF" && op2 === "AF'") || (op1 === "AF'" && op2 === "AF")) {
        (0, emit_1.emitBytes)(ctx, [0x08], node.pos);
        return;
    }
    // EX DE,HL
    if ((op1 === "DE" && op2 === "HL") || (op1 === "HL" && op2 === "DE")) {
        (0, emit_1.emitBytes)(ctx, [0xEB], node.pos);
        return;
    }
    // EX (SP),HL
    if ((op1 === "(SP)" && op2 === "HL") || (op1 === "HL" && op2 === "(SP)")) {
        (0, emit_1.emitBytes)(ctx, [0xE3], node.pos);
        return;
    }
    // EX (SP),IX
    if ((op1 === "(SP)" && op2 === "IX") || (op1 === "IX" && op2 === "(SP)")) {
        (0, emit_1.emitBytes)(ctx, [0xDD, 0xE3], node.pos);
        return;
    }
    // EX (SP),IY
    if ((op1 === "(SP)" && op2 === "IY") || (op1 === "IY" && op2 === "(SP)")) {
        (0, emit_1.emitBytes)(ctx, [0xFD, 0xE3], node.pos);
        return;
    }
    throw new Error(`Unsupported EX form '${op1},${op2}' (allowed: AF,AF' / DE,HL / (SP),HL/IX/IY)`);
}

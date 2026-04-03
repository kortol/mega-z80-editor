"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeIO = encodeIO;
const emit_1 = require("../codegen/emit");
const utils_1 = require("./utils");
/**
 * IN / OUT 命令群
 */
function encodeIO(ctx, node) {
    const op = node.op.toUpperCase();
    const args = node.args;
    const arg0 = args[0]?.toUpperCase?.() ?? "";
    const arg1 = args[1]?.toUpperCase?.() ?? "";
    // --- 明示エラー: IN r,(n) (A以外) ---
    if (op === "IN" &&
        args.length === 2 &&
        arg1.startsWith("(") &&
        arg1 !== "(C)" &&
        arg0 !== "A") {
        throw new Error(`Unsupported IN ${args[0]},${args[1]} (only IN A,(n) is supported)`);
    }
    // --- 明示エラー: OUT (n),r (A以外) ---
    if (op === "OUT" &&
        args.length === 2 &&
        arg0.startsWith("(") &&
        arg0 !== "(C)" &&
        arg1 !== "A") {
        throw new Error(`Unsupported OUT ${args[0]},${args[1]} (only OUT (n),A is supported)`);
    }
    // --- IN A,(n) ---
    if (op === "IN" &&
        args.length === 2 &&
        args[0] === "A" &&
        args[1].startsWith("(")) {
        const portExpr = args[1].slice(1, -1);
        const port = (0, utils_1.resolveValue)(ctx, portExpr);
        if (port === null) {
            (0, emit_1.emitBytes)(ctx, [0xdb, 0x00], node.pos);
            ctx.unresolved.push({
                addr: ctx.loc + 1, symbol: portExpr, size: 1, requester: {
                    op: node.op,
                    phase: "assemble",
                    pos: node.pos,
                }
            });
        }
        else {
            if (port < 0 || port > 0xff)
                throw new Error(`Port number out of range: ${args[1]}`);
            (0, emit_1.emitBytes)(ctx, [0xdb, port & 0xff], node.pos);
        }
        return;
    }
    // --- OUT (n),A ---
    if (op === "OUT" &&
        args.length === 2 &&
        args[0].startsWith("(") &&
        args[1] === "A") {
        const portExpr = args[0].slice(1, -1);
        const port = (0, utils_1.resolveValue)(ctx, portExpr);
        if (port === null) {
            (0, emit_1.emitBytes)(ctx, [0xd3, 0x00], node.pos);
            ctx.unresolved.push({
                addr: ctx.loc + 1, symbol: portExpr, size: 1, requester: {
                    op: node.op,
                    phase: "assemble",
                    pos: node.pos,
                },
            });
        }
        else {
            if (port < 0 || port > 0xff)
                throw new Error(`Port number out of range: ${args[0]}`);
            (0, emit_1.emitBytes)(ctx, [0xd3, port & 0xff], node.pos);
        }
        return;
    }
    // --- IN r,(C) ---
    if (op === "IN" &&
        args.length === 2 &&
        args[1] === "(C)" &&
        (0, utils_1.isReg8)(args[0])) {
        const code = 0x40 | ((0, utils_1.regCode)(args[0]) << 3);
        (0, emit_1.emitBytes)(ctx, [0xed, code], node.pos);
        return;
    }
    // --- 明示エラー: OUT (C),n (0以外) ---
    if (op === "OUT" && args.length === 2 && arg0 === "(C)" && !(0, utils_1.isReg8)(arg1)) {
        const val = (0, utils_1.resolveValue)(ctx, args[1]);
        if (val !== 0) {
            throw new Error(`Unsupported OUT (C),${args[1]} (only 0 is supported)`);
        }
    }
    // --- OUT (C),r ---
    if (op === "OUT" &&
        args.length === 2 &&
        args[0] === "(C)" &&
        (0, utils_1.isReg8)(args[1])) {
        const code = 0x41 | ((0, utils_1.regCode)(args[1]) << 3);
        (0, emit_1.emitBytes)(ctx, [0xed, code], node.pos);
        return;
    }
    // --- IN (C) または IN F,(C) ---
    if (op === "IN" &&
        ((args.length === 1 && args[0] === "(C)") ||
            (args.length === 2 && args[0] === "F" && args[1] === "(C)"))) {
        (0, emit_1.emitBytes)(ctx, [0xed, 0x70], node.pos);
        return;
    }
    // --- OUT (C),0 ---
    if (op === "OUT" &&
        args.length === 2 &&
        args[0] === "(C)" &&
        (0, utils_1.resolveValue)(ctx, args[1]) === 0) {
        (0, emit_1.emitBytes)(ctx, [0xed, 0x71], node.pos);
        return;
    }
    throw new Error(`Unsupported IO instruction ${op} ${args.join(",")}`);
}

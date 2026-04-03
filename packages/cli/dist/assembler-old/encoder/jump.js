"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DJNZInstrDefs = exports.RSTInstrDefs = exports.RETInstrDefs = exports.CALLInstrDefs = exports.JRInstrDefs = exports.JPInstrDefs = void 0;
const emit_1 = require("../codegen/emit");
const errors_1 = require("../errors");
const operandKind_1 = require("../operand/operandKind");
const utils_1 = require("./utils");
const condCodes = {
    NZ: 0x00,
    Z: 0x08,
    NC: 0x10,
    C: 0x18,
    PO: 0x20,
    PE: 0x28,
    P: 0x30,
    M: 0x38,
};
// ====================================================================
// JP 命令群
// ====================================================================
exports.JPInstrDefs = [
    // JP (HL)/(IX)/(IY)
    {
        match: (ctx, args) => args.length === 1 &&
            ((args[0].kind === operandKind_1.OperandKind.IDX && ["(IX)", "(IY)"].includes(args[0].raw.toUpperCase())) ||
                (args[0].kind === operandKind_1.OperandKind.REG_IND && "(HL)" === args[0].raw.toUpperCase())),
        encode(ctx, args, node) {
            // console.log("JP (HL)");
            const t = args[0].raw.toUpperCase();
            if (t === "(HL)")
                (0, emit_1.emitBytes)(ctx, [0xE9], node.pos);
            else if (t === "(IX)")
                (0, emit_1.emitBytes)(ctx, [0xDD, 0xE9], node.pos);
            else
                (0, emit_1.emitBytes)(ctx, [0xFD, 0xE9], node.pos);
            ctx.loc += ctx.texts.at(-1).data.length;
        },
        estimate: (ctx, args) => (args[0].raw.toUpperCase() === "(HL)" ? 1 : 2),
    },
    // JP cc,nn
    {
        match: (ctx, args) => args.length === 2 && condCodes.hasOwnProperty(args[0].raw.toUpperCase()),
        encode(ctx, args, node) {
            const cond = args[0].raw.toUpperCase();
            const val = (0, utils_1.resolveExpr16)(ctx, args[1].raw, node.pos, true);
            const opcode = 0xC2 | condCodes[cond];
            (0, emit_1.emitBytes)(ctx, [opcode, val & 0xFF, val >> 8], node.pos);
        },
        estimate: 3,
    },
    // JP nn
    {
        match: (ctx, args) => args.length === 1,
        encode(ctx, args, node) {
            // console.log("JP NN");
            const val = (0, utils_1.resolveExpr16)(ctx, args[0].raw, node.pos, true);
            (0, emit_1.emitBytes)(ctx, [0xC3, val & 0xFF, val >> 8], node.pos);
        },
        estimate: 3,
    },
];
// ====================================================================
// JR 命令群
// ====================================================================
exports.JRInstrDefs = [
    // JR cc,offset
    {
        match: (ctx, args) => args.length === 2 && condCodes.hasOwnProperty(args[0].raw.toUpperCase()),
        encode(ctx, args, node) {
            const cond = args[0].raw.toUpperCase();
            const target = args[1].raw;
            // ★ 16bit絶対値として評価（$含む式OK）
            const val = (0, utils_1.resolveExpr16)(ctx, target, node.pos, false, false);
            if (ctx.errors.length > 0)
                return;
            // ★ offset計算（target - (loc + 2)）
            const offset = val - (ctx.loc + 2);
            // ★ 範囲チェック
            if (offset < -128 || offset > 127) {
                ctx.errors.push({
                    code: errors_1.AssemblerErrorCode.ExprNotConstant,
                    message: `JR target out of range (${offset}) at line ${node.pos.line}`,
                    pos: node.pos,
                });
                return;
            }
            const opcode = { NZ: 0x20, Z: 0x28, NC: 0x30, C: 0x38 }[cond];
            (0, emit_1.emitBytes)(ctx, [opcode ?? 0, offset & 0xff], node.pos);
        },
        estimate: 2,
    },
    // JR offset
    {
        match: (ctx, args) => args.length === 1,
        encode(ctx, args, node) {
            const target = args[0].raw;
            const val = (0, utils_1.resolveExpr16)(ctx, target, node.pos, false, false);
            if (ctx.errors.length > 0)
                return;
            const offset = val - (ctx.loc + 2);
            if (offset < -128 || offset > 127) {
                ctx.errors.push({
                    code: errors_1.AssemblerErrorCode.ExprNotConstant,
                    message: `JR target out of range (${offset}) at line ${node.pos.line}`,
                    pos: node.pos,
                });
                return;
            }
            (0, emit_1.emitBytes)(ctx, [0x18, offset & 0xff], node.pos);
        },
        estimate: 2,
    },
];
// ====================================================================
// CALL 命令群
// ====================================================================
exports.CALLInstrDefs = [
    // CALL cc,nn
    {
        match: (ctx, args) => args.length === 2 && condCodes.hasOwnProperty(args[0].raw.toUpperCase()),
        encode(ctx, args, node) {
            const cond = args[0].raw.toUpperCase();
            const val = (0, utils_1.resolveExpr16)(ctx, args[1].raw, node.pos, true);
            const opcode = 0xC4 | condCodes[cond];
            (0, emit_1.emitBytes)(ctx, [opcode, val & 0xFF, val >> 8], node.pos);
        },
        estimate: 3,
    },
    // CALL nn
    {
        match: (ctx, args) => args.length === 1,
        encode(ctx, args, node) {
            const val = (0, utils_1.resolveExpr16)(ctx, args[0].raw, node.pos, true);
            (0, emit_1.emitBytes)(ctx, [0xCD, val & 0xFF, val >> 8], node.pos);
        },
        estimate: 3,
    },
];
// ====================================================================
// RET / RST / DJNZ
// ====================================================================
exports.RETInstrDefs = [
    // RET cc
    {
        match: (ctx, args) => args.length === 1 && condCodes.hasOwnProperty(args[0].raw.toUpperCase()),
        encode(ctx, args, node) {
            const cond = args[0].raw.toUpperCase();
            (0, emit_1.emitBytes)(ctx, [0xC0 | condCodes[cond]], node.pos);
        },
    },
    // RET
    {
        match: (ctx, args) => args.length === 0,
        encode(ctx, args, node) {
            (0, emit_1.emitBytes)(ctx, [0xC9], node.pos);
        },
    },
];
exports.RSTInstrDefs = [
    {
        match: (ctx, args) => args.length === 1,
        encode(ctx, args, node) {
            const val = (0, utils_1.resolveExpr8)(ctx, args[0].raw, node.pos, true);
            if (val % 8 !== 0 || val < 0 || val > 0x38)
                throw new Error(`Invalid RST vector ${val}`);
            (0, emit_1.emitBytes)(ctx, [0xC7 + val], node.pos);
        },
    },
];
exports.DJNZInstrDefs = [
    {
        match: (ctx, args) => args.length === 1,
        encode(ctx, args, node) {
            const target = args[0].raw;
            // ★ 16bit絶対値として評価（$もOK）
            const val = (0, utils_1.resolveExpr16)(ctx, target, node.pos, false, false);
            if (ctx.errors.length > 0)
                return;
            // ★ offset計算（target - (loc + 2)）
            const offset = val - (ctx.loc + 2);
            // ★ 範囲チェック
            if (offset < -128 || offset > 127) {
                ctx.errors.push({
                    code: errors_1.AssemblerErrorCode.ExprNotConstant,
                    message: `DJNZ target out of range (${offset}) at line ${node.pos.line}`,
                    pos: node.pos,
                });
                return;
            }
            (0, emit_1.emitBytes)(ctx, [0x10, offset & 0xff], node.pos);
        },
        estimate: 2,
    },
];

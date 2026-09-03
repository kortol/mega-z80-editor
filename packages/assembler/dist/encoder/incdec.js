"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decInstr = exports.incInstr = void 0;
exports.encodeINC = encodeINC;
exports.encodeDEC = encodeDEC;
const emit_1 = require("../codegen/emit");
const classifyOperand_1 = require("../operand/classifyOperand");
const operandKind_1 = require("../operand/operandKind");
const utils_1 = require("./utils");
exports.incInstr = [
    {
        match: (_ctx, args) => args.length === 1 && (args[0].kind === operandKind_1.OperandKind.REG8 || args[0].kind === operandKind_1.OperandKind.REG8X),
        encode(ctx, [r], node) {
            const info = (0, utils_1.reg8Info)(r.raw);
            if (!info)
                throw new Error(`Unsupported INC form at line ${node.pos.line}`);
            const opcode = 0x04 | (info.code << 3);
            (0, emit_1.emitBytes)(ctx, info.prefix ? [info.prefix, opcode] : [opcode], node.pos);
        },
        estimate: (_ctx, [r]) => (r.kind === operandKind_1.OperandKind.REG8X ? 2 : 1),
    },
    {
        match: (_ctx, args) => args.length === 1 && args[0].kind === operandKind_1.OperandKind.REG_IND && args[0].raw === "(HL)",
        encode(ctx, _args, node) {
            (0, emit_1.emitBytes)(ctx, [0x34], node.pos);
        },
        estimate: 1,
    },
    {
        match: (_ctx, args) => args.length === 1 && args[0].kind === operandKind_1.OperandKind.IDX,
        encode(ctx, [r], node) {
            const prefix = r.raw.startsWith("(IX") ? 0xdd : 0xfd;
            const disp = (r.disp ?? 0) & 0xff;
            (0, emit_1.emitBytes)(ctx, [prefix, 0x34, disp], node.pos);
        },
        estimate: 3,
    },
    {
        match: (_ctx, args) => args.length === 1 &&
            args[0].kind === operandKind_1.OperandKind.REG16 &&
            ["BC", "DE", "HL", "SP"].includes(args[0].raw),
        encode(ctx, [r], node) {
            const opcode = 0x03 | ((0, utils_1.reg16Code)(r.raw) << 4);
            (0, emit_1.emitBytes)(ctx, [opcode], node.pos);
        },
        estimate: 1,
    },
    {
        match: (_ctx, args) => args.length === 1 &&
            args[0].kind === operandKind_1.OperandKind.REG16X &&
            (args[0].raw === "IX" || args[0].raw === "IY"),
        encode(ctx, [r], node) {
            const prefix = r.raw === "IX" ? 0xdd : 0xfd;
            (0, emit_1.emitBytes)(ctx, [prefix, 0x23], node.pos);
        },
        estimate: 2,
    },
    {
        match: () => true,
        encode(_ctx, _args, node) {
            throw new Error(`Unsupported INC form at line ${node.pos.line}`);
        },
        estimate: 1,
    },
];
exports.decInstr = [
    {
        match: (_ctx, args) => args.length === 1 && (args[0].kind === operandKind_1.OperandKind.REG8 || args[0].kind === operandKind_1.OperandKind.REG8X),
        encode(ctx, [r], node) {
            const info = (0, utils_1.reg8Info)(r.raw);
            if (!info)
                throw new Error(`Unsupported DEC form at line ${node.pos.line}`);
            const opcode = 0x05 | (info.code << 3);
            (0, emit_1.emitBytes)(ctx, info.prefix ? [info.prefix, opcode] : [opcode], node.pos);
        },
        estimate: (_ctx, [r]) => (r.kind === operandKind_1.OperandKind.REG8X ? 2 : 1),
    },
    {
        match: (_ctx, args) => args.length === 1 && args[0].kind === operandKind_1.OperandKind.REG_IND && args[0].raw === "(HL)",
        encode(ctx, _args, node) {
            (0, emit_1.emitBytes)(ctx, [0x35], node.pos);
        },
        estimate: 1,
    },
    {
        match: (_ctx, args) => args.length === 1 && args[0].kind === operandKind_1.OperandKind.IDX,
        encode(ctx, [r], node) {
            const prefix = r.raw.startsWith("(IX") ? 0xdd : 0xfd;
            const disp = (r.disp ?? 0) & 0xff;
            (0, emit_1.emitBytes)(ctx, [prefix, 0x35, disp], node.pos);
        },
        estimate: 3,
    },
    {
        match: (_ctx, args) => args.length === 1 &&
            args[0].kind === operandKind_1.OperandKind.REG16 &&
            ["BC", "DE", "HL", "SP"].includes(args[0].raw),
        encode(ctx, [r], node) {
            const opcode = 0x0b | ((0, utils_1.reg16Code)(r.raw) << 4);
            (0, emit_1.emitBytes)(ctx, [opcode], node.pos);
        },
        estimate: 1,
    },
    {
        match: (_ctx, args) => args.length === 1 &&
            args[0].kind === operandKind_1.OperandKind.REG16X &&
            (args[0].raw === "IX" || args[0].raw === "IY"),
        encode(ctx, [r], node) {
            const prefix = r.raw === "IX" ? 0xdd : 0xfd;
            (0, emit_1.emitBytes)(ctx, [prefix, 0x2b], node.pos);
        },
        estimate: 2,
    },
    {
        match: () => true,
        encode(_ctx, _args, node) {
            throw new Error(`Unsupported DEC form at line ${node.pos.line}`);
        },
        estimate: 1,
    },
];
function encodeFromDefs(defs, ctx, node) {
    const args = node.args.map(s => (0, classifyOperand_1.classifyOperand)(ctx, s));
    for (const def of defs) {
        if (def.match(ctx, args)) {
            def.encode(ctx, args, node);
            return;
        }
    }
    throw new Error(`Unsupported ${node.op} form at line ${node.pos.line}`);
}
function encodeINC(ctx, node) {
    encodeFromDefs(exports.incInstr, ctx, node);
}
function encodeDEC(ctx, node) {
    encodeFromDefs(exports.decInstr, ctx, node);
}

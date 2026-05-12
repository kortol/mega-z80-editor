"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ldInstr = void 0;
const utils_1 = require("./utils");
const operandKind_1 = require("../operand/operandKind");
const errors_1 = require("../errors");
const emit_1 = require("../codegen/emit");
exports.ldInstr = [
    // --- LD r,r2 ---
    {
        match: (ctx, [dst, src]) => (dst.kind === operandKind_1.OperandKind.REG8 || dst.kind === operandKind_1.OperandKind.REG8X) &&
            (src.kind === operandKind_1.OperandKind.REG8 || src.kind === operandKind_1.OperandKind.REG8X),
        encode(ctx, [dst, src], node) {
            const d = (0, utils_1.reg8Info)(dst.raw);
            const s = (0, utils_1.reg8Info)(src.raw);
            if (!d || !s)
                throw new Error(`Invalid LD r,r at line ${node.pos.line}`);
            const prefix = d.prefix ?? s.prefix;
            if (d.prefix && s.prefix && d.prefix !== s.prefix) {
                throw new Error(`Mixed IX/IY registers in LD at line ${node.pos.line}`);
            }
            const opcode = 0x40 | (d.code << 3) | s.code;
            (0, emit_1.emitBytes)(ctx, prefix ? [prefix, opcode] : [opcode], node.pos);
        },
    },
    // --- LD r,(HL) ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.REG8 &&
            src.kind === operandKind_1.OperandKind.REG_IND &&
            src.raw == "(HL)",
        encode(ctx, [dst], node) {
            const opcode = 0x46 | ((0, utils_1.regCode)(dst.raw) << 3);
            (0, emit_1.emitBytes)(ctx, [opcode], node.pos);
        },
    },
    // --- LD (HL),r ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.REG_IND &&
            dst.raw === "(HL)" &&
            src.kind === operandKind_1.OperandKind.REG8,
        encode(ctx, [, src], node) {
            const opcode = 0x70 | (0, utils_1.regCode)(src.raw);
            (0, emit_1.emitBytes)(ctx, [opcode], node.pos);
        },
    },
    // --- LD A,(BC)/(DE) ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.REG8 &&
            dst.raw === "A" &&
            src.kind === operandKind_1.OperandKind.REG_IND &&
            (src.raw === "(BC)" || src.raw === "(DE)"),
        encode(ctx, [, src], node) {
            (0, emit_1.emitBytes)(ctx, [src.raw === "(BC)" ? 0x0a : 0x1a], node.pos);
        },
    },
    // --- LD (BC)/(DE),A ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.REG_IND &&
            (dst.raw === "(BC)" || dst.raw === "(DE)") &&
            src.kind === operandKind_1.OperandKind.REG8 &&
            src.raw === "A",
        encode(ctx, [dst], node) {
            (0, emit_1.emitBytes)(ctx, [dst.raw === "(BC)" ? 0x02 : 0x12], node.pos);
        },
    },
    // --- LD A,I / LD A,R / LD I,A / LD R,A ---
    {
        match: (ctx, [dst, src]) => (dst.kind === operandKind_1.OperandKind.REG8 &&
            dst.raw === 'A' &&
            src.kind === operandKind_1.OperandKind.REG_IR) || (dst.kind === operandKind_1.OperandKind.REG_IR &&
            src.kind === operandKind_1.OperandKind.REG8 &&
            src.raw === 'A'),
        encode(ctx, [dst, src], node) {
            const table = {
                "A,I": 0x57, "A,R": 0x5f,
                "I,A": 0x47, "R,A": 0x4f,
            };
            (0, emit_1.emitBytes)(ctx, [0xed, table[`${dst.raw},${src.raw}`]], node.pos);
        },
        estimate: 2,
    },
    // --- LD SP,HL ---
    {
        match: (ctx, [dst, src]) => dst.raw === "SP" && src.raw === "HL",
        encode(ctx, args, node) {
            (0, emit_1.emitBytes)(ctx, [0xf9], node.pos);
        },
    },
    // --- LD SP,IX / LD SP,IY ---
    {
        match: (ctx, [dst, src]) => dst.raw === "SP" && src.kind === operandKind_1.OperandKind.REG16X && (src.raw === "IX" || src.raw === "IY"),
        encode(ctx, [dst, src], node) {
            const prefix = src.raw === "IX" ? 0xdd : 0xfd;
            (0, emit_1.emitBytes)(ctx, [prefix, 0xf9], node.pos);
        },
        estimate: 2,
    },
    // --- LD r,n ---
    {
        match: (ctx, [dst, src]) => (dst.kind === operandKind_1.OperandKind.REG8 || dst.kind === operandKind_1.OperandKind.REG8X) &&
            (src.kind === operandKind_1.OperandKind.IMM || src.kind === operandKind_1.OperandKind.EXPR),
        encode(ctx, [dst, src], node) {
            const info = (0, utils_1.reg8Info)(dst.raw);
            if (!info)
                throw new Error(`Invalid LD r,n at line ${node.pos.line}`);
            const val = (0, utils_1.resolveExpr8)(ctx, src.raw, node.pos);
            const opcode = 0x06 | (info.code << 3);
            (0, emit_1.emitBytes)(ctx, info.prefix ? [info.prefix, opcode, val & 0xff] : [opcode, val & 0xff], node.pos);
        },
        estimate: 2,
    },
    // --- LD rr,nn ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.REG16 &&
            (src.kind === operandKind_1.OperandKind.IMM || src.kind === operandKind_1.OperandKind.EXPR),
        encode(ctx, [dst, src], node) {
            const val = (0, utils_1.resolveExpr16)(ctx, src.raw, node.pos);
            (0, emit_1.emitBytes)(ctx, [0x01 | ((0, utils_1.reg16Code)(dst.raw) << 4), val & 0xff, (val >> 8) & 0xff], node.pos);
        },
        estimate: 3,
    },
    // --- LD IX,nn / LD IY,nn ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.REG16X &&
            (dst.raw === "IX" || dst.raw === "IY") &&
            (src.kind === operandKind_1.OperandKind.IMM || src.kind === operandKind_1.OperandKind.EXPR),
        encode(ctx, [dst, src], node) {
            const val = (0, utils_1.resolveExpr16)(ctx, src.raw, node.pos, undefined, false, 2);
            const prefix = dst.raw === "IX" ? 0xdd : 0xfd;
            (0, emit_1.emitBytes)(ctx, [prefix, 0x21, val & 0xff, (val >> 8) & 0xff], node.pos);
        },
        estimate: 4,
    },
    // --- LD (HL),n ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.REG_IND &&
            dst.raw === "(HL)" &&
            (src.kind === operandKind_1.OperandKind.IMM || src.kind === operandKind_1.OperandKind.EXPR),
        encode(ctx, [, src], node) {
            const val = (0, utils_1.resolveExpr8)(ctx, src.raw, node.pos);
            (0, emit_1.emitBytes)(ctx, [0x36, val & 0xff], node.pos);
        },
        estimate: 2,
    },
    // --- LD HL,(nn) ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.REG16 &&
            dst.raw === "HL" &&
            src.kind === operandKind_1.OperandKind.MEM,
        encode(ctx, [, src], node) {
            // ()を除去
            const _src = src.raw.slice(1, -1);
            const val = (0, utils_1.resolveExpr16)(ctx, _src, node.pos);
            (0, emit_1.emitBytes)(ctx, [0x2a, val & 0xff, val >> 8], node.pos);
        },
        estimate: 3,
    },
    // --- LD rr,(nn) --- (extended form, for linker relocation)
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.REG16 &&
            src.kind === operandKind_1.OperandKind.MEM &&
            !["HL", "IX", "IY"].includes(dst.raw),
        encode(ctx, [dst, src], node) {
            // ()を除去
            const _src = src.raw.slice(1, -1);
            // 外部シンボル or 定数式 → 未解決扱いで16bit読み出し命令を擬似生成
            const val = (0, utils_1.resolveExpr16)(ctx, _src, node.pos, undefined, false, 2);
            // Z80には存在しないが、拡張REL生成用としてHL版に合わせる
            // 形式: LD rr,(nn) ≒ prefix(0xED) + code_table[rr] + nn nn
            const regCodeMap = {
                BC: 0x4b,
                DE: 0x5b,
                SP: 0x7b,
            };
            const opcode = regCodeMap[dst.raw];
            if (opcode === undefined) {
                ctx.errors.push({
                    code: errors_1.AssemblerErrorCode.InvalidOperand,
                    message: `Unsupported LD form: ${dst.raw},(nn)`,
                    pos: node.pos,
                });
                return;
            }
            (0, emit_1.emitBytes)(ctx, [0xed, opcode, val & 0xff, val >> 8], node.pos);
        },
        estimate: 4,
    },
    // --- LD IX/IY,(nn) ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.REG16X &&
            (dst.raw === "IX" || dst.raw === "IY") &&
            src.kind === operandKind_1.OperandKind.MEM,
        encode(ctx, [dst, src], node) {
            const _src = src.raw.slice(1, -1);
            const val = (0, utils_1.resolveExpr16)(ctx, _src, node.pos, undefined, false, 2);
            const prefix = dst.raw === "IX" ? 0xdd : 0xfd;
            (0, emit_1.emitBytes)(ctx, [prefix, 0x2a, val & 0xff, val >> 8], node.pos);
        },
        estimate: 4,
    },
    // --- LD (nn),HL ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.MEM &&
            src.kind === operandKind_1.OperandKind.REG16 &&
            src.raw === "HL",
        encode(ctx, [dst], node) {
            // ()を除去
            const _dst = dst.raw.slice(1, -1);
            const val = (0, utils_1.resolveExpr16)(ctx, _dst, node.pos);
            (0, emit_1.emitBytes)(ctx, [0x22, val & 0xff, val >> 8], node.pos);
        },
        estimate: 3,
    },
    // --- LD (nn),rr (BC/DE/SP) ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.MEM &&
            src.kind === operandKind_1.OperandKind.REG16 &&
            ["BC", "DE", "SP"].includes(src.raw),
        encode(ctx, [dst, src], node) {
            const _dst = dst.raw.slice(1, -1);
            const val = (0, utils_1.resolveExpr16)(ctx, _dst, node.pos, undefined, false, 2);
            const regCodeMap = {
                BC: 0x43,
                DE: 0x53,
                SP: 0x73,
            };
            (0, emit_1.emitBytes)(ctx, [0xed, regCodeMap[src.raw], val & 0xff, val >> 8], node.pos);
        },
        estimate: 4,
    },
    // --- LD (nn),IX / LD (nn),IY ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.MEM &&
            src.kind === operandKind_1.OperandKind.REG16X &&
            (src.raw === "IX" || src.raw === "IY"),
        encode(ctx, [dst, src], node) {
            const _dst = dst.raw.slice(1, -1);
            const val = (0, utils_1.resolveExpr16)(ctx, _dst, node.pos, undefined, false, 2);
            const prefix = src.raw === "IX" ? 0xdd : 0xfd;
            (0, emit_1.emitBytes)(ctx, [prefix, 0x22, val & 0xff, val >> 8], node.pos);
        },
        estimate: 4,
    },
    // --- LD A,(nn) ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.REG8 &&
            dst.raw === "A" &&
            src.kind === operandKind_1.OperandKind.MEM,
        encode(ctx, [dst, src], node) {
            const addr = ctx.loc; // ★ 現在位置を固定
            const _src = src.raw.slice(1, -1);
            const val = (0, utils_1.resolveExpr16)({ ...ctx, loc: addr }, _src, node.pos);
            (0, emit_1.emitBytes)(ctx, [0x3a, val & 0xff, val >> 8], node.pos);
        },
        estimate: 3,
    },
    // --- LD (nn),A ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.MEM &&
            src.kind === operandKind_1.OperandKind.REG8 &&
            src.raw === "A",
        encode(ctx, [dst, src], node) {
            const addr = ctx.loc; // ★ 現在位置を固定
            const _dst = dst.raw.slice(1, -1);
            const val = (0, utils_1.resolveExpr16)({ ...ctx, loc: addr }, _dst, node.pos);
            (0, emit_1.emitBytes)(ctx, [0x32, val & 0xff, val >> 8], node.pos);
        },
        estimate: 3,
    },
    // --- LD r,(IX+d) / LD r,(IY+d) ---
    {
        match: (ctx, [dst, src]) => (dst.kind === operandKind_1.OperandKind.REG8 || dst.kind === operandKind_1.OperandKind.REG8X) &&
            src.kind === operandKind_1.OperandKind.IDX,
        encode(ctx, [dst, src], node) {
            const prefix = src.raw.startsWith("(IX") ? 0xdd : 0xfd;
            const disp = (src.disp ?? 0) & 0xff;
            const info = (0, utils_1.reg8Info)(dst.raw);
            if (!info)
                throw new Error(`Invalid LD r,(IX/IY+d) at line ${node.pos.line}`);
            if (info.prefix && info.prefix !== prefix) {
                throw new Error(`Mixed IX/IY registers in LD at line ${node.pos.line}`);
            }
            const opcode = 0x46 | (info.code << 3);
            (0, emit_1.emitBytes)(ctx, [prefix, opcode, disp], node.pos);
        },
        estimate: 3,
    },
    // --- LD (IX+d),r / LD (IY+d),r ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.IDX &&
            (src.kind === operandKind_1.OperandKind.REG8 || src.kind === operandKind_1.OperandKind.REG8X),
        encode(ctx, [dst, src], node) {
            const prefix = dst.raw.startsWith("(IX") ? 0xdd : 0xfd;
            const disp = (dst.disp ?? 0) & 0xff;
            const info = (0, utils_1.reg8Info)(src.raw);
            if (!info)
                throw new Error(`Invalid LD (IX/IY+d),r at line ${node.pos.line}`);
            if (info.prefix && info.prefix !== prefix) {
                throw new Error(`Mixed IX/IY registers in LD at line ${node.pos.line}`);
            }
            const opcode = 0x70 | info.code;
            (0, emit_1.emitBytes)(ctx, [prefix, opcode, disp], node.pos);
        },
        estimate: 3,
    },
    // --- LD (IX+d),n / LD (IY+d),n ---
    {
        match: (ctx, [dst, src]) => dst.kind === operandKind_1.OperandKind.IDX &&
            (src.kind === operandKind_1.OperandKind.IMM || src.kind === operandKind_1.OperandKind.EXPR),
        encode(ctx, [dst, src], node) {
            const prefix = dst.raw.startsWith("(IX") ? 0xdd : 0xfd;
            const disp = (dst.disp ?? 0) & 0xff;
            const val = (0, utils_1.resolveExpr8)(ctx, src.raw, node.pos, undefined, false, false, 3);
            (0, emit_1.emitBytes)(ctx, [prefix, 0x36, disp, val & 0xff], node.pos);
        },
        estimate: 4,
    },
    // --- Fallback: keep detailed LD diagnostics ---
    {
        match: () => true,
        encode(ctx, [dst, src]) {
            const dstStr = dst.raw;
            const srcStr = src.raw;
            const bothMem = dstStr.startsWith("(") && srcStr.startsWith("(");
            if (bothMem) {
                throw new Error(`Unsupported LD form '${dstStr},${srcStr}' (memory-to-memory is invalid)`);
            }
            const dstIdx = dst.kind === operandKind_1.OperandKind.REG16X || dst.kind === operandKind_1.OperandKind.REG8X || dst.kind === operandKind_1.OperandKind.IDX;
            const srcIdx = src.kind === operandKind_1.OperandKind.REG16X || src.kind === operandKind_1.OperandKind.REG8X || src.kind === operandKind_1.OperandKind.IDX;
            if (dstIdx && srcIdx) {
                throw new Error(`Unsupported LD form '${dstStr},${srcStr}' (IX/IY register copy is invalid)`);
            }
            if (dstStr.startsWith("(") && srcIdx) {
                throw new Error(`Unsupported LD form '${dstStr},${srcStr}' (memory <- IX/IY requires (nn),IX/IY or (IX/IY+d),r)`);
            }
            if (dstIdx && srcStr.startsWith("(")) {
                throw new Error(`Unsupported LD form '${dstStr},${srcStr}' (IX/IY <- memory requires IX/IY,(nn) or r,(IX/IY+d))`);
            }
            throw new Error(`Unsupported LD form '${dstStr},${srcStr}'`);
        },
    },
];

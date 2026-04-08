"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDZ = handleDZ;
exports.handleDB = handleDB;
exports.handleDC = handleDC;
exports.handleDW = handleDW;
exports.handleDS = handleDS;
exports.handleWORD32 = handleWORD32;
// src/assembler/pseudo/data.ts
const emit_1 = require("../codegen/emit");
const utils_1 = require("../encoder/utils");
const errors_1 = require("../errors");
const parseExternExpr_1 = require("../expr/parseExternExpr");
function bytesFromLiteral(arg) {
    if (arg.startsWith('"') && arg.endsWith('"')) {
        return arg
            .slice(1, -1)
            .split("")
            .map((ch) => ch.charCodeAt(0) & 0xff);
    }
    if (arg.startsWith("'") && arg.endsWith("'") && arg.length === 3) {
        return [arg.charCodeAt(1) & 0xff];
    }
    return [];
}
// -----------------------------------------------------
// DZ (Define Zero-terminated String/Byte)
// -----------------------------------------------------
function handleDZ(ctx, node) {
    const bytes = [];
    if (ctx.phase !== "emit") {
        let count = 0;
        for (const a of node.args) {
            const v = a.value;
            const lit = bytesFromLiteral(v);
            if (lit.length) {
                count += lit.length;
                continue;
            }
            const ext = (0, parseExternExpr_1.parseExternExpr)(ctx, v);
            if (ext) {
                count += 1;
                continue;
            }
            count += 1;
        }
        (0, emit_1.advanceLC)(ctx, count + 1); // + zero terminator
        return;
    }
    for (const a of node.args) {
        const valStr = a.value;
        const lit = bytesFromLiteral(valStr);
        if (lit.length) {
            bytes.push(...lit);
            continue;
        }
        const ext = (0, parseExternExpr_1.parseExternExpr)(ctx, valStr);
        if (ext) {
            if (bytes.length) {
                (0, emit_1.emitBytes)(ctx, bytes, node.pos);
                bytes.length = 0;
            }
            if (ctx.phase === "emit") {
                (0, emit_1.emitFixup)(ctx, ext.symbol, 1, {
                    op: "DZ",
                    phase: "assemble",
                    pos: node.pos,
                }, ext.addend, node.pos);
            }
            continue;
        }
        const val = (0, utils_1.resolveExpr8)(ctx, valStr, node.pos);
        if (val < 0 || val > 0xff) {
            ctx.warnings.push((0, errors_1.makeWarning)(errors_1.AssemblerErrorCode.ExprOutRange, `DZ value ${val} truncated at line ${node.pos.line}`, { pos: ctx.currentPos }));
        }
        bytes.push(val & 0xff);
    }
    bytes.push(0x00);
    (0, emit_1.emitBytes)(ctx, bytes, node.pos);
}
// -----------------------------------------------------
// DB (Define Byte)
// -----------------------------------------------------
function handleDB(ctx, node) {
    const bytes = [];
    // --- analyze ではサイズだけ前進、出力しない ---
    if (ctx.phase !== "emit") {
        let count = 0;
        for (const a of node.args) {
            const v = a.value;
            const lit = bytesFromLiteral(v);
            if (lit.length) {
                count += lit.length;
                continue;
            }
            const ext = (0, parseExternExpr_1.parseExternExpr)(ctx, v);
            if (ext) {
                count += 1;
                continue;
            } // 外部参照は1バイト仮サイズ
            // 通常式は1バイト
            count += 1;
        }
        (0, emit_1.advanceLC)(ctx, count);
        return;
    }
    for (const a of node.args) {
        const valStr = a.value;
        // --- 文字列／文字 ---
        const lit = bytesFromLiteral(valStr);
        if (lit.length) {
            bytes.push(...lit);
            continue;
        }
        // --- 外部シンボル ± 定数 ---
        const ext = (0, parseExternExpr_1.parseExternExpr)(ctx, valStr);
        if (ext) {
            if (bytes.length) {
                // 外部シンボルは単独レコード扱い（1バイト仮確保）
                (0, emit_1.emitBytes)(ctx, bytes, node.pos); // ← ここでバッファをフラッシュ
                bytes.length = 0;
            }
            if (ctx.phase === "emit") {
                (0, emit_1.emitFixup)(ctx, ext.symbol, 1, {
                    op: "DB", // or "DATA" depending on pseudo
                    phase: "assemble",
                    pos: node.pos,
                }, ext.addend, node.pos);
            }
            continue;
        }
        // --- 通常の式 (例: 1+2*3) ---
        const val = (0, utils_1.resolveExpr8)(ctx, valStr, node.pos);
        if (val < 0 || val > 0xff) {
            ctx.warnings.push((0, errors_1.makeWarning)(errors_1.AssemblerErrorCode.ExprOutRange, `DB value ${val} truncated at line ${node.pos.line}`, { pos: ctx.currentPos }));
        }
        bytes.push(val & 0xFF);
    }
    if (bytes.length > 0) {
        (0, emit_1.emitBytes)(ctx, bytes, node.pos);
    }
}
// -----------------------------------------------------
// DC (M80: set bit7 on the last byte of each argument element)
// -----------------------------------------------------
function handleDC(ctx, node) {
    if (ctx.phase !== "emit") {
        let count = 0;
        for (const a of node.args) {
            const v = a.value;
            const lit = bytesFromLiteral(v);
            if (lit.length) {
                count += lit.length;
                continue;
            }
            const ext = (0, parseExternExpr_1.parseExternExpr)(ctx, v);
            if (ext) {
                count += 1;
                continue;
            }
            count += 1;
        }
        (0, emit_1.advanceLC)(ctx, count);
        return;
    }
    const outBytes = [];
    for (const a of node.args) {
        const valStr = a.value;
        const lit = bytesFromLiteral(valStr);
        if (lit.length) {
            const copied = [...lit];
            copied[copied.length - 1] = copied[copied.length - 1] | 0x80;
            outBytes.push(...copied);
            continue;
        }
        const ext = (0, parseExternExpr_1.parseExternExpr)(ctx, valStr);
        if (ext) {
            if (outBytes.length) {
                (0, emit_1.emitBytes)(ctx, outBytes, node.pos);
                outBytes.length = 0;
            }
            (0, emit_1.emitFixup)(ctx, ext.symbol, 1, {
                op: "DC",
                phase: "assemble",
                pos: node.pos,
            }, ext.addend, node.pos);
            continue;
        }
        const val = (0, utils_1.resolveExpr8)(ctx, valStr, node.pos);
        outBytes.push((val & 0xFF) | 0x80);
    }
    if (outBytes.length > 0) {
        (0, emit_1.emitBytes)(ctx, outBytes, node.pos);
    }
}
// -----------------------------------------------------
// DW (Define Word)
// -----------------------------------------------------
function handleDW(ctx, node) {
    // --- analyze ではサイズだけ前進、出力しない ---
    if (ctx.phase !== "emit") {
        // 文字列は非対応、外部参照は2バイト仮サイズ
        let count = 0;
        for (const a of node.args) {
            const s = a.value;
            if (s.startsWith('"') && s.endsWith('"'))
                continue; // 実際はエラーだが count には乗せない
            const ext = (0, parseExternExpr_1.parseExternExpr)(ctx, s);
            count += ext ? 2 : 2;
        }
        (0, emit_1.advanceLC)(ctx, count);
        return;
    }
    const words = [];
    for (const a of node.args) {
        const valStr = a.value;
        if (valStr.startsWith('"') && valStr.endsWith('"')) {
            throw new Error(`DW does not support string literal`);
        }
        // --- 外部シンボル ± 定数 ---
        const ext = (0, parseExternExpr_1.parseExternExpr)(ctx, valStr);
        if (ext) {
            // 途中で外部シンボルが出た場合は、現バッファをフラッシュしてemit
            if (words.length > 0) {
                const bytes = [];
                for (const w of words)
                    bytes.push(w & 0xFF, (w >> 8) & 0xFF);
                (0, emit_1.emitBytes)(ctx, bytes, node.pos);
                words.length = 0;
            }
            if (ctx.phase === "emit") {
                const addr = ctx.loc;
                (0, emit_1.emitFixup)(ctx, ext.symbol, 2, {
                    op: "DW", // or "DATA" depending on pseudo
                    phase: "assemble",
                    pos: node.pos,
                }, ext.addend, node.pos);
            }
            continue;
        }
        // --- 通常の式（Reloc禁止で評価） ---
        const val = (0, utils_1.resolveExpr16)(ctx, valStr, node.pos, false, true);
        if (val < -0x8000 || val > 0xffff) {
            ctx.warnings.push((0, errors_1.makeWarning)(errors_1.AssemblerErrorCode.ExprOutRange, `DW value ${val} truncated at line ${node.pos.line}`, { pos: ctx.currentPos }));
        }
        words.push(val);
    }
    // 🔹最後にまとめてemit
    if (words.length > 0) {
        const bytes = [];
        for (const w of words)
            bytes.push(w & 0xFF, (w >> 8) & 0xFF);
        (0, emit_1.emitBytes)(ctx, bytes, node.pos);
    }
}
// -----------------------------------------------------
// DS (Define Storage)
// -----------------------------------------------------
function handleDS(ctx, node) {
    const valStr = node.args[0].value;
    // (将来案) handleDS 内に追加
    const ext = (0, parseExternExpr_1.parseExternExpr)(ctx, valStr);
    if (ext) {
        ctx.unresolved.push({
            addr: (0, emit_1.getLC)(ctx), symbol: ext.symbol, size: 0, addend: ext.addend, sectionId: ctx.currentSection ?? 0, requester: {
                op: "DS",
                phase: "assemble",
                pos: node.pos,
            },
        });
        return;
    }
    const n = (0, utils_1.resolveExpr16)(ctx, valStr, node.pos, false, /*rejectReloc*/ true); // reloc不可
    if (ctx.phase !== "emit") {
        (0, emit_1.advanceLC)(ctx, Math.max(0, n));
        return;
    }
    (0, emit_1.emitGap)(ctx, Math.max(0, n), node.pos);
}
function handleWORD32(ctx, node) {
    if (node.args.length > 0) {
        throw new Error(`.WORD32 does not take operands at line ${node.pos.line}`);
    }
    ctx.modeWord32 = true;
}

"use strict";
// packages\cli\src\assembler\encoder\utils.ts
/**
 * utils.ts - Z80 assembler encoding utilities
 *
 * このファイルは encoder 各モジュール（LD/ALU/JP など）で共通利用される
 * 判定・変換系ユーティリティをまとめたもの。
 *
 * ⚠️ 注意：
 *   - isImm8 / isImm16 / isAbs16 / isMemAddress を混同しないこと
 *   - 順序によって LD A,(1234H) が誤って LD A,1234 と解釈される可能性があるため、
 *     encode 側で必ず (HL)/(IX+d)/(IY+d) → (nn) → imm8 の順に判定すること
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveValue = resolveValue;
exports.isReg8 = isReg8;
exports.reg8Info = reg8Info;
exports.reg8Prefix = reg8Prefix;
exports.isReg16 = isReg16;
exports.regCode = regCode;
exports.reg16Code = reg16Code;
exports.isImm8 = isImm8;
exports.isImm16 = isImm16;
exports.isAbs16 = isAbs16;
exports.isMemAddress = isMemAddress;
exports.isIdxReg = isIdxReg;
exports.parseIndexAddr = parseIndexAddr;
exports.resolveExpr8 = resolveExpr8;
exports.resolveExpr16 = resolveExpr16;
const errors_1 = require("../errors");
const eval_1 = require("../expr/eval");
const parserExpr_1 = require("../expr/parserExpr");
const tokenizer_1 = require("../tokenizer");
/* -------------------- 値解決 -------------------- */
/** 式/シンボル/数値リテラルを数値に変換。未解決なら null */
function resolveValue(ctx, expr) {
    if (expr === "$")
        return ctx.loc;
    try {
        return (0, tokenizer_1.parseNumber)(expr);
    }
    catch {
        return null;
    }
}
/* -------------------- レジスタ -------------------- */
/** 8bit レジスタかどうか (A,B,C,D,E,H,L) */
function isReg8(r) {
    return ["A", "B", "C", "D", "E", "H", "L"].includes(r.toUpperCase());
}
function reg8Info(r) {
    const upper = r.toUpperCase();
    const base = {
        B: 0,
        C: 1,
        D: 2,
        E: 3,
        H: 4,
        L: 5,
        A: 7,
    };
    if (upper in base)
        return { code: base[upper] };
    if (upper === "IXH")
        return { code: 4, prefix: 0xdd };
    if (upper === "IXL")
        return { code: 5, prefix: 0xdd };
    if (upper === "IYH")
        return { code: 4, prefix: 0xfd };
    if (upper === "IYL")
        return { code: 5, prefix: 0xfd };
    return null;
}
function reg8Prefix(r) {
    return reg8Info(r)?.prefix;
}
/** 16bit レジスタかどうか (BC,DE,HL,SP) */
function isReg16(r) {
    return ["BC", "DE", "HL", "SP"].includes(r.toUpperCase());
}
/** 8bit レジスタコード (for opcode encoding) */
function regCode(r) {
    const key = r.toUpperCase();
    const table = {
        B: 0,
        C: 1,
        D: 2,
        E: 3,
        H: 4,
        L: 5,
        "(HL)": 6,
        A: 7,
    };
    if (!(key in table))
        throw new Error(`Invalid 8bit register: ${r}`);
    return table[key];
}
/** 16bit レジスタコード (for opcode encoding) */
function reg16Code(r) {
    const key = r.toUpperCase();
    const table = { BC: 0, DE: 1, HL: 2, SP: 3 };
    if (!(key in table))
        throw new Error(`Invalid 16bit register: ${r}`);
    return table[key];
}
/* -------------------- 即値 -------------------- */
/** 8bit 即値かどうか */
function isImm8(ctx, v) {
    const val = resolveValue(ctx, v);
    return val !== null && val >= 0 && val <= 0xff;
}
/** 16bit 即値かどうか */
function isImm16(ctx, v) {
    const val = resolveValue(ctx, v);
    return val !== null && val >= 0 && val <= 0xffff;
}
/* -------------------- アドレス -------------------- */
/** 裸の 16bit アドレス（括弧なし数値/シンボル） */
function isAbs16(v) {
    return (/^\d+$/.test(v) || // 10進
        /^[0-9A-F]+H$/i.test(v) || // 16進 (末尾H)
        /^0x[0-9A-F]+$/i.test(v) || // 16進 (0x)
        /^%[01]+$/.test(v) // 2進
    );
}
/** 括弧付きアドレス (例: (1234H), (LABEL)) */
function isMemAddress(s) {
    return /^\(.+\)$/.test(s.trim()); // ()で囲まれていればメモリ参照
}
function isIdxReg(s) {
    const upperCase = s.toUpperCase();
    return upperCase.includes("IX") || upperCase.includes("IY");
}
/**
 * (IX+d) / (IY+d) の場合に prefix と disp を返す
 * 例: (IX+01H) → { prefix: 0xDD, disp: 0x01 }
 */
function parseIndexAddr(ctx, v) {
    const m = /^\((IX|IY)(?:([+-])(.+))?\)$/i.exec(v);
    if (!m)
        return null;
    const prefix = m[1].toUpperCase() === "IX" ? 0xdd : 0xfd;
    let disp = 0;
    if (m[2] && m[3]) {
        const val = resolveValue(ctx, m[3]);
        if (val === null)
            throw new Error(`Unresolved displacement: ${m[3]}`);
        const signed = m[2] === "-" ? -val : val;
        if (signed < -128 || signed > 127)
            throw new Error(`Index displacement out of range: ${signed}`);
        disp = signed & 0xff;
    }
    return { prefix, disp };
}
function resolveExpr8(ctx, expr, pos, strict, rejectReloc = false, relative = false, relocOffset = 1) {
    const effectiveStrict = strict ?? ctx.options.strictOverflow ?? false;
    const prevErrCount = ctx.errors.length;
    const tokens = (0, tokenizer_1.tokenize)(ctx, expr).filter(t => t.kind !== "eol");
    const e = (0, parserExpr_1.parseExpr)(tokens);
    const res = (0, eval_1.evalExpr)(e, { ...ctx, pass: 1, visiting: new Set(), externs: ctx.externs });
    // --- Reloc値 ---
    if (res.kind === "Reloc") {
        if (rejectReloc) {
            throw new Error(`Relocatable expression '${expr}' not allowed here (line ${pos.line})`);
        }
        // --- pass2 のときだけ記録 ---
        if (ctx.phase === "emit") {
            const relocEntry = {
                addr: ctx.loc + relocOffset,
                symbol: res.sym,
                size: 1,
                sectionId: ctx.currentSection ?? 0,
            };
            if (res.addend && res.addend !== 0)
                relocEntry.addend = res.addend;
            if (relative)
                relocEntry.relative = true;
            if (!ctx.relocs)
                ctx.relocs = [];
            ctx.relocs.push(relocEntry);
            ctx.unresolved.push(relocEntry);
        }
        return 0;
    }
    const newErrors = ctx.errors.slice(prevErrCount);
    if (newErrors.length > 0) {
        const err = ctx.errors[ctx.errors.length - 1];
        if (effectiveStrict) {
            throw new Error(`Expression error at line ${pos.line}: ${err.message ?? err.code}`);
        }
        ctx.errors.push({
            code: errors_1.AssemblerErrorCode.ExprNotConstant,
            message: `Expression error at line ${pos.line}`,
            pos,
        });
        return 0;
    }
    // --- Const値 ---
    if (res.kind === "Const") {
        if (res.value < -128 || res.value > 255) {
            if (effectiveStrict) {
                throw new Error(`8bit immediate out of range: ${res.value} (line ${pos.line})`);
            }
            ctx.warnings.push((0, errors_1.makeWarning)(errors_1.AssemblerErrorCode.ExprOverflow, `8bit immediate out of range at line ${pos.line}`, { pos }));
            return res.value & 0xff;
        }
        return res.value & 0xFF;
    }
    throw new Error(`Unexpected evalExpr result at line ${pos.line}`);
}
function resolveExpr16(ctx, expr, pos, strict, rejectReloc = false, relocOffset = 1) {
    const effectiveStrict = strict ?? ctx.options.strictOverflow ?? false;
    const prevErrCount = ctx.errors.length;
    const tokens = (0, tokenizer_1.tokenize)(ctx, expr).filter(t => t.kind !== "eol");
    const e = (0, parserExpr_1.parseExpr)(tokens);
    const res = (0, eval_1.evalExpr)(e, { ...ctx, pass: 1, visiting: new Set(), externs: ctx.externs });
    // console.log("evalExpr");
    // 🧩 Relocatable の場合は newErrors よりも優先的に処理する
    // console.log("Reloc");
    // ---- Reloc値 ----
    if (res.kind === "Reloc") {
        if (rejectReloc) {
            throw new Error(`Relocatable expression '${expr}' not allowed here (line ${pos.line})`);
        }
        // --- pass2 のときだけ記録 ---
        if (ctx.phase === "emit") {
            const relocEntry = {
                addr: ctx.loc + relocOffset,
                symbol: res.sym,
                addend: Number(res.addend ?? 0),
                size: 2,
                sectionId: ctx.currentSection ?? 0,
                requester: {
                    op: "ENCODER", // 呼び出し元フェーズ
                    phase: "assemble",
                    pos,
                },
            };
            // 🔸 新: Rレコード用に ctx.relocs にも記録
            if (!ctx.relocs)
                ctx.relocs = [];
            ctx.relocs.push(relocEntry);
            // 従来の未解決リスト（後方互換）
            ctx.unresolved.push(relocEntry);
            // console.log("Reloc");
        }
        return 0;
    }
    const newErrors = ctx.errors.slice(prevErrCount);
    if (newErrors.length > 0) {
        const err = ctx.errors[ctx.errors.length - 1];
        // console.log("newErrors");
        if (effectiveStrict) {
            throw new Error(`Expression error at line ${pos.line}: ${err.message ?? err.code}`);
        }
        ctx.errors.push({
            code: errors_1.AssemblerErrorCode.ExprNotConstant,
            message: `Expression error at line ${pos.line}`,
            pos,
        });
        // console.log("ExprNotConstant");
        return 0;
    }
    // console.log("Const");
    // ---- Const値 ----
    if (res.kind === "Const") {
        if (res.value < -32768 || res.value > 0xFFFF) {
            if (effectiveStrict) {
                throw new Error(`16bit immediate out of range: ${res.value} (line ${pos.line})`);
            }
            ctx.warnings.push((0, errors_1.makeWarning)(errors_1.AssemblerErrorCode.ExprOverflow, `16bit immediate out of range at line ${pos.line}`, { pos }));
            return res.value & 0xffff;
        }
        return res.value & 0xFFFF;
    }
    // console.log("Unexpected");
    // ---- 想定外 ----
    throw new Error(`Unexpected evalExpr result at line ${pos.line}`);
}

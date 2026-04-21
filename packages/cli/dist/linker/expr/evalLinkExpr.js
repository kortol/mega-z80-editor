"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evalLinkExpr = evalLinkExpr;
/**
 * P1-F: リンク時式評価 (symbol ± const, numberのみ対応)
 *
 * 入力例:
 *   "1234"
 *   "FOO"
 *   "BAR+2"
 *   "EXTSYM-4"
 *
 * 出力:
 *   { ok:true, value: number } または { ok:false, unresolved: [...] }
 */
function evalLinkExpr(expr, resolve, options = {}, ctx) {
    const wrap16 = options.wrap16 ?? true;
    const ops = options.ops ?? ["+", "-"];
    const maxDepth = options.maxDepth ?? 8;
    const unresolved = new Set();
    const errors = [];
    const trim = expr.trim();
    if (!trim)
        return { ok: false, errors: ["Empty expression"] };
    // --- 1️⃣ 純定数 (16進 or 10進)
    const num = parseNumber(trim);
    if (num !== null) {
        return { ok: true, value: wrap16 ? num & 0xFFFF : num };
    }
    // --- 2️⃣ シンボル ± 定数、または定数 ± 定数 ---
    // Accept linker symbol names that may include dots (e.g. TESTNAME.TEST, .text)
    // in addition to plain identifiers.
    const m = trim.match(/^([A-Za-z_.$?][A-Za-z0-9_.$?]*|[0-9A-F]+H|0x[0-9A-F]+|\d+)([+\-]\d+|[+\-]0x[0-9A-Fa-f]+|[+\-][0-9A-Fa-f]+H)?$/i);
    if (!m) {
        return { ok: false, errors: ["Unsupported expression (only symbol±const supported)"] };
    }
    const name = m[1];
    const addend = m[2] ? parseNumber(m[2]) ?? 0 : 0;
    // 「数値 ± 定数」なら直接計算して返す
    if (parseNumber(name) !== null) {
        const base = parseNumber(name);
        const val = base + addend;
        return { ok: true, value: wrap16 ? val & 0xFFFF : val };
    }
    // --- 3️⃣ リゾルバ呼び出し ---
    let sym;
    try {
        sym = resolve(name, ctx);
    }
    catch (e) {
        return { ok: false, errors: [`Resolver threw exception: ${e.message}`] };
    }
    if (sym.kind === "defined") {
        const val = (sym.addr + addend) & 0xFFFF;
        return { ok: true, value: wrap16 ? val & 0xFFFF : val };
    }
    if (sym.kind === "extern" || sym.kind === "unknown") {
        unresolved.add(name);
        return { ok: false, unresolved: Array.from(unresolved) };
    }
    return { ok: false, errors: ["Unexpected resolution state"] };
}
/** 数値文字列 → number */
function parseNumber(token) {
    const t = token.trim().toUpperCase();
    const sign = t.startsWith("-") ? -1 : 1;
    const body = t.replace(/^[+\-]/, "");
    if (/^[0-9A-F]+H$/.test(body))
        return sign * parseInt(body.slice(0, -1), 16);
    if (/^0X[0-9A-F]+$/.test(body))
        return sign * parseInt(body.slice(2), 16);
    if (/^[+\-]?\d+$/.test(t))
        return parseInt(t, 10);
    return null;
}

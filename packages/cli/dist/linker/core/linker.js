"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.linkModules = linkModules;
const evalLinkExpr_1 = require("../expr/evalLinkExpr"); // ★ 追加
function linkModules(mods) {
    const symbols = new Map();
    const texts = [];
    const refs = [];
    let entry;
    // パス1: シンボル収集
    for (const mod of mods) {
        for (const s of mod.symbols) {
            if (symbols.has(s.name)) {
                const existing = symbols.get(s.name);
                // EXTERN仮定義 → 上書きOK
                if (existing.addr === 0) {
                    symbols.set(s.name, { bank: 0, addr: s.addr });
                    continue;
                }
                // 同一値の重複定義は許容（複数モジュールで共通定数を定義するケース）
                if (existing.addr === s.addr) {
                    continue;
                }
                throw new Error(`Duplicate symbol '${s.name}'`);
            }
            symbols.set(s.name, { bank: 0, addr: s.addr });
        }
        texts.push(...mod.texts);
        refs.push(...mod.refs);
        if (mod.entry !== undefined && entry === undefined) {
            entry = mod.entry;
        }
        // extern宣言の登録
        for (const x of mod.externs) {
            if (!symbols.has(x)) {
                symbols.set(x, { bank: 0, addr: 0 }); // 仮定義
            }
        }
    }
    // ★ リゾルブコンテキスト生成
    const ctx = {
        symbols,
        externs: new Set(mods.flatMap(m => m.externs)),
    };
    // ★ resolver関数
    const resolver = (name, context = ctx) => {
        if (context.symbols.has(name)) {
            return { kind: "defined", addr: context.symbols.get(name).addr };
        }
        else if (context.externs?.has(name)) {
            return { kind: "extern" };
        }
        else {
            return { kind: "unknown" };
        }
    };
    // パス2: メモリ配置
    const mem = new Uint8Array(0x10000);
    let minUsed = 0xffff;
    let maxUsed = 0;
    for (const t of texts) {
        for (let i = 0; i < t.bytes.length; i++) {
            const addr = t.addr + i;
            if (mem[addr] !== 0)
                throw new Error(`Overlap at ${addr.toString(16)}`);
            mem[addr] = t.bytes[i];
            minUsed = Math.min(minUsed, addr);
            maxUsed = Math.max(maxUsed, addr);
        }
    }
    // ★ Rレコード適用（evalLinkExpr使用）
    for (const r of refs) {
        const res = (0, evalLinkExpr_1.evalLinkExpr)(r.sym, resolver, { wrap16: true }, ctx);
        if (res.ok) {
            const v = res.value & 0xFFFF;
            mem[r.addr] = v & 0xFF;
            mem[r.addr + 1] = (v >> 8) & 0xFF;
        }
        else {
            // 未解決またはエラー → 0埋め
            mem[r.addr] = 0;
            mem[r.addr + 1] = 0;
            if (res.unresolved) {
                console.warn(`⚠️ Unresolved symbol(s): ${res.unresolved.join(", ")} at ${r.addr.toString(16)}h`);
            }
            if (res.errors) {
                console.warn(`⚠️ Eval error: ${res.errors.join("; ")} (at ${r.addr.toString(16)}h)`);
            }
        }
    }
    return {
        segments: [
            {
                bank: 0,
                kind: "text",
                range: { min: minUsed, max: maxUsed },
                data: mem.slice(minUsed, maxUsed + 1),
            },
        ],
        entry,
        symbols,
    };
}

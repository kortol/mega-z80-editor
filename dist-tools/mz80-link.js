"use strict";
const fs = require("fs");
// ========== .rel パーサ ==========
function parseRelFile(filename) {
    const lines = fs.readFileSync(filename, "utf8")
        .split(/\r?\n/)
        .map((l) => l.replace(/;.*/, "").trim())
        .filter(Boolean);
    const mod = { name: "", symbols: [], texts: [], refs: [] };
    for (const line of lines) {
        const [rec, ...rest] = line.split(/\s+/);
        switch (rec) {
            case "H":
                mod.name = rest[0];
                break;
            case "T": {
                const base = parseInt(rest[0], 16);
                const bytes = rest.slice(1).map((x) => parseInt(x, 16));
                mod.texts.push({ addr: base, bytes });
                break;
            }
            case "S":
                mod.symbols.push({ name: rest[0], addr: parseInt(rest[1], 16) });
                break;
            case "R":
                mod.refs.push({ addr: parseInt(rest[0], 16), sym: rest[1] });
                break;
            case "E":
                mod.entry = parseInt(rest[0], 16);
                break;
            default:
                throw new Error(`Unknown record '${rec}' in ${filename}`);
        }
    }
    return mod;
}
// ========== リンク処理 ==========
function linkRelFiles(inputs, output) {
    const symbols = new Map();
    const texts = [];
    const refs = [];
    let entry;
    // --- パス1: シンボル収集 ---
    for (const file of inputs) {
        const mod = parseRelFile(file);
        for (const s of mod.symbols) {
            if (symbols.has(s.name)) {
                throw new Error(`Duplicate symbol '${s.name}' defined in ${file}`);
            }
            symbols.set(s.name, s.addr);
        }
        texts.push(...mod.texts);
        refs.push(...mod.refs);
        if (mod.entry !== undefined && entry === undefined) {
            entry = mod.entry;
        }
    }
    // --- パス2: メモリ配置 ---
    const mem = new Uint8Array(0x10000);
    let minUsed = 0xffff;
    let maxUsed = 0;
    for (const t of texts) {
        for (let i = 0; i < t.bytes.length; i++) {
            const addr = t.addr + i;
            if (mem[addr] !== 0) {
                throw new Error(`Overlap at ${addr.toString(16)}`);
            }
            mem[addr] = t.bytes[i];
            minUsed = Math.min(minUsed, addr);
            maxUsed = Math.max(maxUsed, addr);
        }
    }
    // --- R レコード適用 ---
    for (const r of refs) {
        if (!symbols.has(r.sym)) {
            throw new Error(`Undefined symbol '${r.sym}'`);
        }
        const val = symbols.get(r.sym);
        mem[r.addr] = val & 0xff;
        mem[r.addr + 1] = (val >> 8) & 0xff;
    }
    // --- 出力 ---
    const bin = mem.slice(minUsed, maxUsed + 1);
    fs.writeFileSync(output, bin);
    console.log(`Linked ${inputs.length} modules -> ${output}`);
    console.log(`Range: ${minUsed.toString(16)}h..${maxUsed.toString(16)}h`);
    if (entry !== undefined) {
        console.log(`Entry point: ${entry.toString(16)}h`);
    }
}
// ========== CLI エントリ ==========
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.error("Usage: ts-node mz80-link.ts <input1.rel> <input2.rel> ... -o <output.bin>");
        process.exit(1);
    }
    const outIndex = args.indexOf("-o");
    if (outIndex === -1 || outIndex === args.length - 1) {
        console.error("Output file not specified. Use -o <output.bin>");
        process.exit(1);
    }
    const output = args[outIndex + 1];
    const inputs = args.slice(0, outIndex);
    try {
        linkRelFiles(inputs, output);
    }
    catch (err) {
        console.error("Link error:", err.message);
        process.exit(1);
    }
}

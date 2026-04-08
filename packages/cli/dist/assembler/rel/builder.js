"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelBuilder = void 0;
exports.buildRelFile = buildRelFile;
exports.buildRelModuleV2 = buildRelModuleV2;
exports.emitRelV2 = emitRelV2;
// packages/cli/src/assembler/rel/builder.ts
const fs_1 = __importDefault(require("fs"));
const writerV2_1 = require("./writerV2");
class RelBuilder {
    file;
    constructor(moduleName) {
        this.file = { module: moduleName, records: [], unresolved: [] };
        this.file.records.push({ kind: "H", name: moduleName });
    }
    addText(addr, bytes) {
        this.file.records.push({ kind: "T", addr, bytes });
    }
    addSymbol(name, addr, sectionId) {
        this.file.records.push({ kind: "S", name, addr, sectionId });
    }
    addReloc(addr, sym, addend = 0) {
        this.file.records.push({ kind: "R", size: 2, addr, sym, addend });
    }
    setEntry(addr) {
        this.file.records.push({ kind: "E", addr });
    }
    // ★ 未解決シンボルを追加する
    addUnresolved(addr, symbol) {
        this.file.unresolved.push({ addr, symbol });
        this.file.records.push({
            kind: "R",
            addr,
            size: 2,
            sym: symbol,
            addend: 0,
        }); // ← 追加
    }
    build() {
        return this.file;
    }
}
exports.RelBuilder = RelBuilder;
function buildRelFile(ctx) {
    const records = [];
    // H
    records.push({ kind: "H", name: ctx.moduleName });
    // T
    for (const t of ctx.texts) {
        records.push({ kind: "T", addr: t.addr, bytes: t.data });
    }
    // // R
    // for (const r of ctx.relocs) {
    //   records.push({ kind: "R", addr: r.addr, sym: r.sym, size: r.size });
    // }
    // S
    // If PUBLIC/GLOBAL symbols are declared, emit only those exports.
    // Otherwise keep backward-compatible behavior and emit all defined symbols.
    const exportFilterEnabled = ctx.exportSymbols.size > 0;
    for (const [sym, entry] of ctx.symbols.entries()) {
        if (typeof entry !== "number" && entry.type === "EXTERN") {
            continue;
        }
        if (exportFilterEnabled) {
            const key = ctx.caseInsensitive ? sym.toUpperCase() : sym;
            if (!ctx.exportSymbols.has(key)) {
                continue;
            }
        }
        const addr = typeof entry === "number" ? entry : entry.value;
        const sectionId = typeof entry === "number" ? 0 : entry.sectionId ?? 0;
        records.push({
            kind: "S",
            name: sym,
            addr,
            sectionId
        });
    }
    // R
    for (const r of ctx.unresolved) {
        records.push({
            kind: "R",
            addr: r.addr,
            sym: r.symbol,
            size: r.size,
            addend: r.addend,
        });
    }
    // X
    for (const ext of ctx.externs) {
        records.push({ kind: "X", name: ext });
    }
    // E
    if (ctx.entry !== undefined) {
        records.push({ kind: "E", addr: ctx.entry });
    }
    else if (ctx.texts.length > 0) {
        // END未指定なら補完する
        if (ctx.symbols.has("START")) {
            const entry = ctx.symbols.get("START");
            ctx.entry = entry?.value;
        }
        else if (ctx.loc !== undefined) {
            ctx.entry = ctx.loc;
        }
    }
    if (ctx.entry !== undefined) {
        records.push({ kind: "E", addr: ctx.entry });
    }
    return {
        module: ctx.moduleName,
        records,
        unresolved: ctx.unresolved,
    };
}
// --- 省略: RelBuilder / buildRelFile (v1互換) は既存のまま ---
// strtab ユーティリティ
function buildStrTab(names) {
    const offsets = new Map();
    const bytes = [];
    for (const name of names) {
        if (offsets.has(name))
            continue;
        const off = bytes.length;
        offsets.set(name, off);
        for (const ch of name)
            bytes.push(ch.charCodeAt(0));
        bytes.push(0);
    }
    return { strtab: Uint8Array.from(bytes), offsets };
}
// V2モジュール構築（sections/symbols/fixups/strtab/data を全部作る）
function buildRelModuleV2(ctx) {
    // 1) Sections
    const sections = Array.from(ctx.sections.values()).map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        align: s.align,
        size: s.bytes.length, // s.size ではなく実データ長を優先
        flags: s.flags,
        data: Uint8Array.from(s.bytes),
    }));
    // dataOffset を後で付与するので先に data ブロブを作る
    let cursor = 0;
    const blobParts = [];
    for (const sec of sections) {
        sec.dataOffset = cursor;
        blobParts.push(sec.data);
        cursor += sec.data.length;
    }
    const data = blobParts.length ? new Uint8Array(cursor) : new Uint8Array();
    if (blobParts.length) {
        let p = 0;
        for (const part of blobParts) {
            data.set(part, p);
            p += part.length;
        }
    }
    // 2) Symbols（暫定：ABS/REL/EXT の3種のみ）
    const symbols = [];
    const exportFilterEnabled = ctx.exportSymbols.size > 0;
    // - 定義済み: REL（暫定で sectionId=0/TEXT）or ABS（EQUなどで将来拡張）
    for (const [name, val] of ctx.symbols.entries()) {
        if (exportFilterEnabled) {
            const key = ctx.caseInsensitive ? name.toUpperCase() : name;
            if (!ctx.exportSymbols.has(key))
                continue;
        }
        if (typeof val === "number") {
            symbols.push({
                name,
                storage: "REL", // TODO: EQU等はABSに切替
                sectionId: 0, // TODO: 定義位置からセクション特定へ置換
                value: val, // TODO: セクション内相対へ変換（ORG運用により要調整）
            });
        }
        else {
            if (val.type === "EXTERN")
                continue; // ← ここでスキップ
            const storage = val.type === "CONST" ? "ABS" : "REL";
            symbols.push({
                name,
                storage,
                sectionId: val.sectionId ?? 0,
                value: val.value ?? 0,
            });
        }
    }
    // - EXTERN: EXT
    for (const name of ctx.externs) {
        symbols.push({
            name,
            storage: "EXT",
            sectionId: null,
            value: 0,
        });
    }
    // 3) Fixups（ctx.unresolved → V2へ）
    //    暫定：sectionId=0/TEXT, offset=addr を採用。width=r.size.
    const fixups = (ctx.unresolved ?? []).map((r, i) => {
        // r.symbol のインデックスを後で張るため、一旦ダミー(-1)で入れて後で解決してもOKだが、
        // ここでは name→index を先に作れるよう、後段で再マップする。
        return {
            sectionId: 0, // TODO: 実際はその命令が出力されたセクションID
            offset: r.addr, // TODO: セクション内オフセットに調整
            width: (r.size ?? 2), // v1準拠 1 or 2
            signed: false, // TODO: 将来拡張
            pcrel: false, // TODO: JRなどPC相対が来たらtrue
            symIndex: -1, // 後で解決
            addend: r.addend ?? 0,
        };
    });
    // 4) strtab の構築（セクション名＋シンボル名）
    const allNames = [
        ...sections.map((s) => s.name),
        ...symbols.map((s) => s.name),
    ];
    const { strtab, offsets } = buildStrTab(allNames);
    // セクション・シンボルにnameStrOffを付与
    for (const sec of sections)
        sec.nameStrOff = offsets.get(sec.name);
    for (const sym of symbols)
        sym.nameStrOff = offsets.get(sym.name);
    // 5) fixup の symIndex を name → index で張る
    const symIndexByName = new Map();
    symbols.forEach((s, idx) => symIndexByName.set(s.name, idx));
    // ctx.unresolvedの順番に対応するsym名で検索
    (ctx.unresolved ?? []).forEach((r, i) => {
        const idx = symIndexByName.get(r.symbol);
        if (idx !== undefined) {
            fixups[i].symIndex = idx;
        }
        else {
            // 未登録ならEXTとして追加して張る（理屈上はあり得る）
            const extra = {
                name: r.symbol,
                storage: "EXT",
                sectionId: null,
                value: 0,
                nameStrOff: offsets.get(r.symbol) ?? undefined,
            };
            const newIndex = symbols.push(extra) - 1;
            fixups[i].symIndex = newIndex;
        }
    });
    // 6) ヘッダ作成
    const header = {
        magic: "MZ8R",
        version: 2,
        flags: 0,
        sectionCount: sections.length,
        strTabSize: strtab.length,
        symCount: symbols.length,
        fixupCount: fixups.length,
        dataSize: data.length,
        entrySymIndex: -1,
    };
    return {
        header,
        sections,
        symbols,
        fixups,
        texts: ctx.texts.map((t) => ({
            sectionId: t.sectionId ?? ctx.currentSection ?? 0,
            addr: t.addr,
            data: t.data,
            line: t.pos.line,
        })),
        entry: ctx.entry, // undefinedなら未指定
        data,
        strtab,
        entrySymIndex: -1,
    };
}
// 既存 emitRelV2 は “構築→書き出し→OutputInfo更新” に専念
function emitRelV2(ctx, outPath) {
    const mod = buildRelModuleV2(ctx);
    (0, writerV2_1.writeRelV2)(mod, outPath);
    // OutputInfo 更新（サイズは実ファイルで確定）
    if (!ctx.output)
        ctx.output = { relVersion: 2, generatedAt: new Date() };
    ctx.output.relVersion = 2;
    ctx.output.relPath = outPath;
    try {
        const stat = fs_1.default.statSync(outPath);
        ctx.output.relSize = stat.size;
    }
    catch {
        ctx.output.relSize = mod.data.length + mod.strtab.length + 32; // おおよそ
    }
    ctx.output.generatedAt = new Date();
}

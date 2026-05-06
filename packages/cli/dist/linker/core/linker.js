"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.linkModules = linkModules;
exports.linkModulesV2 = linkModulesV2;
const evalLinkExpr_1 = require("../expr/evalLinkExpr"); // ★ 追加
function linkModules(mods) {
    const symbols = new Map();
    const warnings = [];
    const texts = [];
    const refs = [];
    let entry;
    const sectionBase = new Map();
    const singleSectionByMod = new Map();
    const sectionKey = (modIndex, section) => `${modIndex}::${section ?? ""}`;
    const normalizeSection = (section) => (section ?? "CSEG").toUpperCase();
    const isAbsoluteSection = (section) => normalizeSection(section) === "ASEG";
    // Section-based placement pass (CSEG/DSEG/COMMON/ASEG).
    let cursor = 0;
    mods.forEach((mod, modIndex) => {
        const grouped = new Map();
        for (const t of mod.texts) {
            const sec = t.section ?? "CSEG";
            const g = grouped.get(sec) ?? { min: Number.MAX_SAFE_INTEGER, max: -1 };
            g.min = Math.min(g.min, t.addr);
            g.max = Math.max(g.max, t.addr + t.bytes.length - 1);
            grouped.set(sec, g);
        }
        singleSectionByMod.set(modIndex, grouped.size === 1 ? Array.from(grouped.keys())[0] : undefined);
        for (const [sec, range] of grouped.entries()) {
            if (range.max < 0) {
                sectionBase.set(sectionKey(modIndex, sec), 0);
                continue;
            }
            if (isAbsoluteSection(sec) || range.min > 0) {
                sectionBase.set(sectionKey(modIndex, sec), 0);
                cursor = Math.max(cursor, range.max + 1);
            }
            else {
                const base = cursor;
                sectionBase.set(sectionKey(modIndex, sec), base);
                cursor = Math.max(cursor, base + range.max + 1);
            }
        }
    });
    // パス1: シンボル収集
    mods.forEach((mod, modIndex) => {
        for (const s of mod.symbols) {
            const sec = s.section ?? singleSectionByMod.get(modIndex);
            const base = sectionBase.get(sectionKey(modIndex, sec)) ?? 0;
            const resolvedAddr = s.addr + base;
            if (symbols.has(s.name)) {
                const existing = symbols.get(s.name);
                // EXTERN仮定義 → 上書きOK
                if (existing.addr === 0) {
                    symbols.set(s.name, {
                        bank: 0,
                        addr: resolvedAddr,
                        module: s.module ?? mod.name,
                        section: sec,
                        definedAt: formatDefinedAt(s.defFile, s.defLine),
                    });
                    continue;
                }
                // 同一値の重複定義は許容（複数モジュールで共通定数を定義するケース）
                if (existing.addr === resolvedAddr) {
                    continue;
                }
                throw new Error(`Duplicate symbol '${s.name}'`);
            }
            symbols.set(s.name, {
                bank: 0,
                addr: resolvedAddr,
                module: s.module ?? mod.name,
                section: sec,
                definedAt: formatDefinedAt(s.defFile, s.defLine),
            });
        }
        texts.push(...mod.texts.map((t) => {
            const base = sectionBase.get(sectionKey(modIndex, t.section ?? singleSectionByMod.get(modIndex))) ?? 0;
            return { addr: t.addr + base, bytes: t.bytes };
        }));
        refs.push(...mod.refs.map((r) => {
            const base = sectionBase.get(sectionKey(modIndex, r.section ?? singleSectionByMod.get(modIndex))) ?? 0;
            return { addr: r.addr + base, sym: r.sym };
        }));
        if (mod.entry !== undefined && entry === undefined) {
            const base = sectionBase.get(sectionKey(modIndex, singleSectionByMod.get(modIndex))) ?? 0;
            entry = mod.entry + base;
        }
        // extern宣言の登録
        for (const x of mod.externs) {
            if (!symbols.has(x)) {
                symbols.set(x, { bank: 0, addr: 0 }); // 仮定義
            }
        }
    });
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
    const moduleSectionBases = buildModuleSectionBases(mods, sectionBase);
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
        moduleSectionBases,
    };
}
function normalizeSectionName(name) {
    if (!name)
        return "CSEG";
    return name.replace(/^\./, "").toUpperCase();
}
function inferSectionKind(name, kind) {
    if (kind)
        return kind;
    const n = normalizeSectionName(name);
    if (n === "ASEG")
        return "ASEG";
    if (n.includes("TEXT") || n === "CSEG")
        return "TEXT";
    if (n.includes("DATA") || n === "DSEG")
        return "DATA";
    if (n.includes("BSS"))
        return "BSS";
    return "CUSTOM";
}
function alignUp(value, align) {
    if (!align || align <= 1)
        return value;
    return (value + align - 1) & ~(align - 1);
}
function buildModuleSections(mod) {
    if (mod.sections && mod.sections.length > 0)
        return mod.sections;
    const order = [];
    for (const t of mod.texts) {
        const name = t.section ?? ".text";
        const key = name.toLowerCase();
        if (!order.some((n) => n.toLowerCase() === key))
            order.push(name);
    }
    if (order.length === 0)
        order.push(".text");
    return order.map((name, idx) => ({ id: idx, name }));
}
function sectionSize(mod, secName, info) {
    if (info?.size && info.size > 0)
        return info.size;
    let max = 0;
    for (const t of mod.texts) {
        if (!t.section)
            continue;
        if (normalizeSectionName(t.section) !== normalizeSectionName(secName))
            continue;
        const end = t.addr + t.bytes.length;
        if (end > max)
            max = end;
    }
    return max;
}
function linkModulesV2(mods, opts = {}) {
    const symbols = new Map();
    const warnings = [];
    const texts = [];
    const refs = [];
    let entry;
    const sectionBase = new Map();
    const sectionKey = (modIndex, sectionName) => `${modIndex}::${normalizeSectionName(sectionName)}`;
    const moduleDefaultSection = new Map();
    // --- Pass 0: collect section metadata ---
    const moduleSections = mods.map((mod) => buildModuleSections(mod));
    moduleSections.forEach((sections, modIndex) => {
        if (sections.length === 1) {
            moduleDefaultSection.set(modIndex, sections[0].name);
        }
    });
    // --- Pass 1: placement by kind ---
    const textSections = [];
    const dataSections = [];
    const bssSections = [];
    const customSections = [];
    const asegSections = [];
    moduleSections.forEach((sections, modIndex) => {
        const mod = mods[modIndex];
        for (const sec of sections) {
            const kind = inferSectionKind(sec.name, sec.kind);
            const size = sectionSize(mod, sec.name, sec);
            const entry = { modIndex, sec: { ...sec, kind }, size };
            if (kind === "TEXT")
                textSections.push(entry);
            else if (kind === "DATA")
                dataSections.push(entry);
            else if (kind === "BSS")
                bssSections.push(entry);
            else if (kind === "ASEG")
                asegSections.push(entry);
            else
                customSections.push(entry);
        }
    });
    if (dataSections.length > 0 && opts.orgData === undefined && dataSections.every(s => s.sec.org === undefined)) {
        warnings.push("DATA/DSEG base not specified; placed after TEXT.");
    }
    if (bssSections.length > 0 && opts.orgBss === undefined && bssSections.every(s => s.sec.org === undefined)) {
        warnings.push("BSS base not specified; placed after DATA.");
    }
    if (customSections.length > 0 && opts.orgCustom === undefined && customSections.every(s => s.sec.org === undefined)) {
        warnings.push("CUSTOM base not specified; placed after BSS.");
    }
    let cursorText = opts.orgText ?? 0;
    for (const item of textSections) {
        const align = item.sec.align ?? 1;
        const base = opts.orgText !== undefined
            ? alignUp(cursorText, align)
            : item.sec.org !== undefined
                ? item.sec.org
                : alignUp(cursorText, align);
        sectionBase.set(sectionKey(item.modIndex, item.sec.name), base);
        cursorText = Math.max(cursorText, base + item.size);
    }
    let cursorData = opts.orgData ?? cursorText;
    for (const item of dataSections) {
        const align = item.sec.align ?? 1;
        const base = opts.orgData !== undefined
            ? alignUp(cursorData, align)
            : item.sec.org !== undefined
                ? item.sec.org
                : alignUp(cursorData, align);
        sectionBase.set(sectionKey(item.modIndex, item.sec.name), base);
        cursorData = Math.max(cursorData, base + item.size);
    }
    let cursorBss = opts.orgBss ?? cursorData;
    for (const item of bssSections) {
        const align = item.sec.align ?? 1;
        const base = opts.orgBss !== undefined
            ? alignUp(cursorBss, align)
            : item.sec.org !== undefined
                ? item.sec.org
                : alignUp(cursorBss, align);
        sectionBase.set(sectionKey(item.modIndex, item.sec.name), base);
        cursorBss = Math.max(cursorBss, base + item.size);
    }
    let cursorCustom = opts.orgCustom ?? cursorBss;
    for (const item of customSections) {
        const align = item.sec.align ?? 1;
        const base = opts.orgCustom !== undefined
            ? alignUp(cursorCustom, align)
            : item.sec.org !== undefined
                ? item.sec.org
                : alignUp(cursorCustom, align);
        sectionBase.set(sectionKey(item.modIndex, item.sec.name), base);
        cursorCustom = Math.max(cursorCustom, base + item.size);
    }
    for (const item of asegSections) {
        sectionBase.set(sectionKey(item.modIndex, item.sec.name), 0);
    }
    // --- Pass 2: symbols / texts / refs ---
    const sectionMeta = new Map();
    for (const item of [...textSections, ...dataSections, ...bssSections, ...customSections, ...asegSections]) {
        const base = sectionBase.get(sectionKey(item.modIndex, item.sec.name)) ?? 0;
        sectionMeta.set(sectionKey(item.modIndex, item.sec.name), {
            kind: item.sec.kind ?? "TEXT",
            base,
            size: item.size,
        });
    }
    mods.forEach((mod, modIndex) => {
        const defaultSection = moduleDefaultSection.get(modIndex);
        for (const s of mod.symbols) {
            if (s.storage === "EXT")
                continue;
            const secName = s.section ?? defaultSection ?? ".text";
            const base = sectionBase.get(sectionKey(modIndex, secName)) ?? 0;
            const kind = inferSectionKind(secName);
            const storage = s.storage ?? (kind === "ASEG" ? "ABS" : "REL");
            const resolvedAddr = storage === "ABS" ? s.addr : s.addr + base;
            if (symbols.has(s.name)) {
                const existing = symbols.get(s.name);
                if (existing.addr === 0) {
                    symbols.set(s.name, {
                        bank: 0,
                        addr: resolvedAddr,
                        module: s.module ?? mod.name,
                        section: secName,
                        definedAt: formatDefinedAt(s.defFile, s.defLine),
                    });
                    continue;
                }
                if (existing.addr === resolvedAddr) {
                    continue;
                }
                throw new Error(`Duplicate symbol '${s.name}'`);
            }
            symbols.set(s.name, {
                bank: 0,
                addr: resolvedAddr,
                module: s.module ?? mod.name,
                section: secName,
                definedAt: formatDefinedAt(s.defFile, s.defLine),
            });
        }
        texts.push(...mod.texts.map((t) => {
            const secName = t.section ?? defaultSection ?? ".text";
            const base = sectionBase.get(sectionKey(modIndex, secName)) ?? 0;
            return { addr: t.addr + base, bytes: t.bytes };
        }));
        refs.push(...mod.refs.map((r) => {
            const secName = r.section ?? defaultSection ?? ".text";
            const base = sectionBase.get(sectionKey(modIndex, secName)) ?? 0;
            return { addr: r.addr + base, sym: r.sym };
        }));
        if (mod.entry !== undefined && entry === undefined) {
            const base = sectionBase.get(sectionKey(modIndex, defaultSection ?? ".text")) ?? 0;
            entry = mod.entry + base;
        }
        for (const x of mod.externs) {
            if (!symbols.has(x)) {
                symbols.set(x, { bank: 0, addr: 0 });
            }
        }
    });
    const ctx = {
        symbols,
        externs: new Set(mods.flatMap(m => m.externs)),
    };
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
    // --- Pass 3: memory image ---
    const mem = new Uint8Array(0x10000);
    let minUsed = 0xffff;
    let maxUsed = 0;
    for (const t of texts) {
        for (let i = 0; i < t.bytes.length; i++) {
            const addr = t.addr + i;
            mem[addr] = t.bytes[i];
            minUsed = Math.min(minUsed, addr);
            maxUsed = Math.max(maxUsed, addr);
        }
    }
    for (const r of refs) {
        const res = (0, evalLinkExpr_1.evalLinkExpr)(r.sym, resolver, { wrap16: true }, ctx);
        if (res.ok) {
            const v = res.value & 0xFFFF;
            mem[r.addr] = v & 0xFF;
            mem[r.addr + 1] = (v >> 8) & 0xFF;
        }
        else {
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
    if (minUsed === 0xffff && maxUsed === 0) {
        minUsed = 0;
        maxUsed = 0;
    }
    const segmentOrder = ["TEXT", "DATA", "BSS", "CUSTOM"];
    const detailByKind = new Map();
    for (const item of [...textSections, ...dataSections, ...bssSections, ...customSections]) {
        const base = sectionBase.get(sectionKey(item.modIndex, item.sec.name)) ?? 0;
        const list = detailByKind.get(item.sec.kind ?? "TEXT") ?? [];
        list.push({
            name: item.sec.name,
            base,
            size: item.size,
            align: item.sec.align,
            org: item.sec.org,
        });
        detailByKind.set(item.sec.kind ?? "TEXT", list);
    }
    const segments = [];
    for (const kind of segmentOrder) {
        const ranges = [];
        for (const [key, meta] of sectionMeta.entries()) {
            if (meta.kind !== kind)
                continue;
            if (meta.size <= 0)
                continue;
            ranges.push({ min: meta.base, max: meta.base + meta.size - 1 });
        }
        if (ranges.length === 0)
            continue;
        const min = Math.min(...ranges.map(r => r.min));
        const max = Math.max(...ranges.map(r => r.max));
        const kindLower = kind.toLowerCase();
        segments.push({
            bank: 0,
            kind: kindLower,
            range: { min, max },
            data: kind === "BSS" ? undefined : mem.slice(min, max + 1),
        });
    }
    const segmentDetails = segments.map((seg) => {
        const kindUpper = seg.kind.toUpperCase();
        return {
            kind: seg.kind,
            sections: (detailByKind.get(kindUpper) ?? []).sort((a, b) => a.base - b.base),
        };
    });
    const moduleSectionBases = buildModuleSectionBases(mods, sectionBase);
    return {
        segments,
        entry,
        symbols,
        warnings,
        moduleSectionBases,
        segmentDetails,
    };
}
function formatDefinedAt(defFile, defLine) {
    if (!defFile) {
        return typeof defLine === "number" && Number.isFinite(defLine)
            ? `line:${Math.trunc(defLine)}`
            : undefined;
    }
    if (typeof defLine !== "number" || !Number.isFinite(defLine))
        return defFile;
    return `${defFile}:${Math.trunc(defLine)}`;
}
function buildModuleSectionBases(mods, sectionBase) {
    const out = [];
    for (const [key, base] of sectionBase.entries()) {
        const sep = key.indexOf("::");
        if (sep < 0)
            continue;
        const modIndex = Number.parseInt(key.slice(0, sep), 10);
        const section = key.slice(sep + 2) || "CSEG";
        if (!Number.isFinite(modIndex) || modIndex < 0 || modIndex >= mods.length)
            continue;
        out.push({
            moduleIndex: modIndex,
            moduleName: mods[modIndex].name,
            section,
            base: base & 0xffff,
        });
    }
    return out;
}

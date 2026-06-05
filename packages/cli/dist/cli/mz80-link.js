"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.link = link;
const parser_1 = require("../linker/core/parser");
const linker_1 = require("../linker/core/linker");
const binAdapter_1 = require("../linker/output/binAdapter");
const mapAdapter_1 = require("../linker/output/mapAdapter");
const symAdapter_1 = require("../linker/output/symAdapter");
const logAdapter_1 = require("../linker/output/logAdapter");
const archive_1 = require("../linker/archive");
const path = __importStar(require("path"));
const model_1 = require("../sourcemap/model");
function link(inputFiles, outputFile, opts) {
    const verbose = !!opts.verbose;
    const { mods, sourceMaps } = loadLinkInputs(inputFiles, verbose);
    const hasV2 = mods.some((m) => m.version === 2);
    const hasV1 = mods.some((m) => !m.version || m.version === 1);
    if (hasV2 && hasV1) {
        throw new Error("Mixed .rel versions are not supported. Rebuild all modules with the same rel version.");
    }
    const orgText = parseAddr(opts.orgText);
    const orgData = parseAddr(opts.orgData);
    const orgBss = parseAddr(opts.orgBss);
    const orgCustom = parseAddr(opts.orgCustom);
    const result = hasV2
        ? (0, linker_1.linkModulesV2)(mods, { orgText, orgData, orgBss, orgCustom })
        : (0, linker_1.linkModules)(mods);
    if (verbose) {
        console.log(`[PASS1] Collected ${result.symbols.size} symbols`);
        console.log(`[PASS2] Linked ${result.segments.length} segment(s)`);
    }
    // .bin
    const binFrom = parseAddr(opts.binFrom);
    const binTo = parseAddr(opts.binTo);
    new binAdapter_1.BinOutputAdapter(result, { com: !!opts.com, binFrom, binTo }).write(outputFile, verbose);
    // .map
    if (opts.map) {
        const fullpath = normalizeFullpathMode(opts.fullpath);
        new mapAdapter_1.MapAdapter(result, { fullpath, cwd: process.cwd() }).write(outputFile.replace(/\.[^.]+$/, ".map"), verbose);
    }
    // .sym
    if (opts.sym) {
        new symAdapter_1.SymAdapter(result).write(outputFile.replace(/\.[^.]+$/, ".sym"), verbose);
    }
    // .log
    if (opts.log) {
        // 現状はconsole.warnから収集予定 → 将来 logBuffer に差し替え
        new logAdapter_1.LogAdapter(result, result.warnings ?? []).write(outputFile.replace(/\.[^.]+$/, ".log"), verbose);
    }
    if (opts.smap) {
        const outPath = outputFile.replace(/\.[^.]+$/, ".smap");
        const entries = [];
        const sectionBaseIndex = new Map();
        for (const b of result.moduleSectionBases ?? []) {
            sectionBaseIndex.set(`${b.moduleIndex}:${normalizeSection(b.section)}`, b.base & 0xffff);
        }
        mods.forEach((mod, i) => {
            const sm = sourceMaps[i];
            if (!sm)
                return;
            for (const e of sm.entries) {
                const sec = normalizeSection(e.section);
                const base = sectionBaseIndex.get(`${i}:${sec}`) ?? 0;
                entries.push({
                    ...e,
                    addr: (e.addr + base) & 0xffff,
                    module: mod.name,
                    section: sec,
                });
            }
        });
        const out = {
            version: 1,
            kind: "link",
            output: path.resolve(outputFile).replace(/\\/g, "/"),
            entries,
        };
        (0, model_1.writeSourceMap)(outPath, out);
    }
    if (verbose) {
        console.log(`✅ Linked ${inputFiles.length} modules -> ${outputFile}`);
    }
}
function loadLinkInputs(inputFiles, verbose) {
    const directMods = [];
    const directMaps = [];
    const archives = [];
    for (const filePath of inputFiles) {
        if ((0, archive_1.isArchivePath)(filePath)) {
            if (verbose)
                console.log(`[ARCHIVE] ${filePath}`);
            archives.push((0, archive_1.loadArchiveFile)(filePath));
            continue;
        }
        if (verbose)
            console.log(`[LOAD] ${filePath}`);
        directMods.push((0, parser_1.parseRelFile)(filePath));
        directMaps.push((0, model_1.readSourceMap)(filePath.replace(/\.[^.]+$/, ".smap")));
    }
    if (archives.length === 0) {
        return { mods: directMods, sourceMaps: directMaps };
    }
    const selectedMods = [...directMods];
    const selectedMaps = [...directMaps];
    const satisfied = new Set();
    const unresolved = new Set();
    const refreshState = () => {
        satisfied.clear();
        unresolved.clear();
        for (const mod of selectedMods) {
            for (const sym of mod.symbols) {
                if (sym.storage !== "EXT")
                    satisfied.add(sym.name);
            }
        }
        for (const mod of selectedMods) {
            for (const ext of mod.externs) {
                if (!satisfied.has(ext))
                    unresolved.add(ext);
            }
        }
    };
    refreshState();
    let changed = true;
    const usedMembers = new Set();
    while (changed) {
        changed = false;
        for (const archive of archives) {
            for (const member of archive.members) {
                const memberKey = `${archive.path}:${member.name}`;
                if (usedMembers.has(memberKey))
                    continue;
                const provides = member.module.symbols.some((sym) => sym.storage !== "EXT" && unresolved.has(sym.name));
                if (!provides)
                    continue;
                if (verbose)
                    console.log(`[ARCHIVE-LOAD] ${archive.path} -> ${member.name}`);
                usedMembers.add(memberKey);
                selectedMods.push(member.module);
                selectedMaps.push(null);
                refreshState();
                changed = true;
            }
        }
    }
    return { mods: selectedMods, sourceMaps: selectedMaps };
}
function normalizeSection(section) {
    return (section ?? "CSEG").replace(/^\./, "").toUpperCase();
}
function normalizeFullpathMode(value) {
    if (value === true)
        return "rel";
    if (value === undefined || value === null)
        return "off";
    const t = String(value).trim().toLowerCase();
    if (t === "on" || t === "off" || t === "rel")
        return t;
    return "off";
}
function parseAddr(value) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value === "number" && Number.isFinite(value))
        return Math.trunc(value);
    const t = String(value).trim().toUpperCase();
    if (/^[0-9A-F]+H$/.test(t))
        return parseInt(t.slice(0, -1), 16);
    if (/^0X[0-9A-F]+$/.test(t))
        return parseInt(t.slice(2), 16);
    if (/^\d+$/.test(t))
        return parseInt(t, 10);
    return undefined;
}

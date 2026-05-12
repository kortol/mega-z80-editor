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
const path = __importStar(require("path"));
const model_1 = require("../sourcemap/model");
function link(inputFiles, outputFile, opts) {
    const verbose = !!opts.verbose;
    const mods = inputFiles.map((f) => {
        if (verbose)
            console.log(`[LOAD] ${f}`);
        return (0, parser_1.parseRelFile)(f);
    });
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
            const inPath = inputFiles[i].replace(/\.[^.]+$/, ".smap");
            const sm = (0, model_1.readSourceMap)(inPath);
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

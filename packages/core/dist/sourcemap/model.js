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
exports.normalizeMapPath = normalizeMapPath;
exports.readSourceMap = readSourceMap;
exports.writeSourceMap = writeSourceMap;
exports.buildAddrToSource = buildAddrToSource;
const fs = __importStar(require("fs"));
function normalizeMapPath(p) {
    return p.replace(/\\/g, "/");
}
function readSourceMap(filePath) {
    if (!fs.existsSync(filePath))
        return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries))
        return null;
    const entries = [];
    for (const e of parsed.entries) {
        if (!e)
            continue;
        const addr = (Number(e.addr) | 0) & 0xffff;
        const size = Math.max(1, Number(e.size) | 0);
        const file = typeof e.file === "string" ? normalizeMapPath(e.file) : "";
        const line = Number(e.line) | 0;
        if (!file || line <= 0)
            continue;
        const column = e.column != null ? Math.max(1, Number(e.column) | 0) : undefined;
        const module = typeof e.module === "string" ? e.module : undefined;
        const section = typeof e.section === "string" ? e.section : undefined;
        entries.push({ addr, size, file, line, column, module, section });
    }
    return {
        version: 1,
        kind: parsed.kind === "link" ? "link" : "as",
        module: typeof parsed.module === "string" ? parsed.module : undefined,
        output: typeof parsed.output === "string" ? parsed.output : undefined,
        entries,
    };
}
function writeSourceMap(filePath, map) {
    const normalized = {
        ...map,
        version: 1,
        entries: map.entries.map((e) => ({
            ...e,
            addr: e.addr & 0xffff,
            size: Math.max(1, e.size | 0),
            file: normalizeMapPath(e.file),
            line: Math.max(1, e.line | 0),
            column: e.column != null ? Math.max(1, e.column | 0) : undefined,
        })),
    };
    fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
}
function buildAddrToSource(entries) {
    const map = new Map();
    for (const e of entries) {
        for (let i = 0; i < e.size; i++) {
            const addr = (e.addr + i) & 0xffff;
            if (!map.has(addr))
                map.set(addr, e);
        }
    }
    return map;
}

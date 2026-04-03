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
exports.parseRelFile = parseRelFile;
// src/linker/core/parser.ts
const fs = __importStar(require("fs"));
function parseRelFile(filename) {
    const lines = fs.readFileSync(filename, "utf8")
        .split(/\r?\n/)
        .map(l => l.replace(/;.*/, "").trim())
        .filter(Boolean);
    const mod = { name: "", symbols: [], texts: [], refs: [], externs: [], };
    // 各行をパース
    for (const line of lines) {
        const [rec, ...rest] = line.split(/\s+/);
        switch (rec) {
            case "H":
                mod.name = rest[0];
                break;
            case "T": {
                const base = parseInt(rest[0], 16);
                const bytes = rest.slice(1).map(x => parseInt(x, 16));
                mod.texts.push({ addr: base, bytes });
                break;
            }
            case "S":
                mod.symbols.push({ name: rest[0], addr: parseInt(rest[1], 16) });
                break;
            case "R":
                mod.refs.push({ addr: parseInt(rest[0], 16), sym: rest[1] });
                break;
            case "X":
                // rest[0] がシンボル名
                const extName = rest[0];
                if (extName)
                    mod.externs.push(extName);
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

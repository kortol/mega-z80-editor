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
exports.JsonRelAdapter = exports.TextRelAdapter = void 0;
// src/assembler/rel/adapter.ts
const path = __importStar(require("path"));
function hex4(n) {
    return n.toString(16).padStart(4, "0").toUpperCase();
}
function hex2(n) {
    return n.toString(16).padStart(2, "0").toUpperCase();
}
function makeHeader(filename) {
    const base = path.basename(filename, path.extname(filename));
    return base.toUpperCase();
}
class TextRelAdapter {
    write(file) {
        return file.records.map(r => {
            switch (r.kind) {
                case "H": return `H ${makeHeader(r.name)}`;
                case "T": return `T ${hex4(r.addr)} ${r.bytes.map(hex2).join(" ")}`;
                case "S": return `S ${r.name} ${hex4(r.addr)}`;
                case "R": {
                    let addendStr = "";
                    if (typeof r.addend === "number" && r.addend !== 0) {
                        addendStr = r.addend > 0 ? `+${r.addend}` : `${r.addend}`;
                    }
                    return `R ${hex4(r.addr)} ${r.sym}${addendStr}`;
                }
                case "X": return `X ${r.name}`;
                case "E": return `E ${hex4(r.addr)}`;
            }
        }).join("\n");
    }
}
exports.TextRelAdapter = TextRelAdapter;
class JsonRelAdapter {
    write(file) {
        return JSON.stringify(file, null, 2);
    }
}
exports.JsonRelAdapter = JsonRelAdapter;

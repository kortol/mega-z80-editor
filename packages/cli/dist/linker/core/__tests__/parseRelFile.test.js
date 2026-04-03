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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/linker/core/__tests__/parseRelFile.test.ts
const crypto_1 = require("crypto");
const parser_1 = require("../parser");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os_1 = __importDefault(require("os"));
describe("P1-F: parseRelFile", () => {
    const tmpDir = path.join(os_1.default.tmpdir(), "mz80-tests-" + (0, crypto_1.randomUUID)());
    const relPath = path.join(tmpDir, "TEST_REL.rel");
    function safeUnlink(p) {
        try {
            fs.unlinkSync(p);
        }
        catch { /* ignore */ }
    }
    function safeRmdir(p) {
        try {
            fs.rmdirSync(p);
        }
        catch { /* ignore */ }
    }
    beforeAll(() => {
        fs.mkdirSync(tmpDir, { recursive: true });
        const content = [
            "H TESTMOD",
            "S LABEL1 0100",
            "T 0100 3E 01",
            "R 0101 EXT1",
            "X EXT1",
            "E 0100"
        ].join("\n");
        fs.writeFileSync(relPath, content);
    });
    afterAll(() => {
        if (fs.existsSync(relPath)) {
            safeUnlink(relPath);
        }
        // 一時ディレクトリも削除
        safeRmdir(tmpDir);
    });
    it("parses .rel file correctly", () => {
        const mod = (0, parser_1.parseRelFile)(relPath);
        expect(mod.name).toBe("TESTMOD");
        expect(mod.symbols[0]).toEqual({ name: "LABEL1", addr: 0x0100 });
        expect(mod.texts[0]).toEqual({ addr: 0x0100, bytes: [0x3E, 0x01] });
        expect(mod.refs[0]).toEqual({ addr: 0x0101, sym: "EXT1" });
        expect(mod.externs).toContain("EXT1");
        expect(mod.entry).toBe(0x0100);
    });
});

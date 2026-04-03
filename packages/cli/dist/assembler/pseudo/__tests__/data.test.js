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
const context_1 = require("../../context");
const pseudo_1 = require("../../pseudo");
const extern = __importStar(require("../../expr/parseExternExpr"));
const emit_1 = require("../../codegen/emit");
function makeCtx() {
    const ctx = (0, context_1.createContext)({ moduleName: "TEST" });
    (0, emit_1.initCodegen)(ctx, { withDefaultSections: true });
    ctx.phase = "emit"; // 未解決シンボル登録を有効化
    return ctx;
}
function makeNode(op, args = [], pos = { line: 1, file: "test.asm", phase: "analyze" }) {
    return { kind: "pseudo", op, args: args.map(arg => ({ value: arg })), pos };
}
describe("pseudo - DB/DW", () => {
    test("DB with numeric list", () => {
        const ctx = makeCtx();
        (0, pseudo_1.handlePseudo)(ctx, makeNode("DB", ["1", "2", "3"]));
        expect(ctx.texts[0].data).toEqual([1, 2, 3]);
    });
    test("DB with char literal", () => {
        const ctx = makeCtx();
        (0, pseudo_1.handlePseudo)(ctx, makeNode("DB", ["'A'"]));
        expect(ctx.texts[0].data).toEqual([0x41]);
    });
    test("DB with string literal", () => {
        const ctx = makeCtx();
        (0, pseudo_1.handlePseudo)(ctx, makeNode('DB', ['"ABC"']));
        expect(ctx.texts[0].data).toEqual([0x41, 0x42, 0x43]);
    });
    test("DB with mixed args", () => {
        const ctx = makeCtx();
        (0, pseudo_1.handlePseudo)(ctx, makeNode("DB", ["'A'", '"BC"', "5"]));
        expect(ctx.texts[0].data).toEqual([0x41, 0x42, 0x43, 5]);
    });
    test("DW with numeric value", () => {
        const ctx = makeCtx();
        (0, pseudo_1.handlePseudo)(ctx, makeNode("DW", ["1234H"]));
        expect(ctx.texts[0].data).toEqual([0x34, 0x12]);
    });
    test("DW with char literal", () => {
        const ctx = makeCtx();
        (0, pseudo_1.handlePseudo)(ctx, makeNode("DW", ["'A'"]));
        expect(ctx.texts[0].data).toEqual([0x41, 0x00]);
    });
    test("DW with string literal (error)", () => {
        const ctx = makeCtx();
        expect(() => (0, pseudo_1.handlePseudo)(ctx, makeNode("DW", ['"AB"']))).toThrow(/does not support/i);
    });
    test("DW with numeric list", () => {
        const ctx = makeCtx();
        (0, pseudo_1.handlePseudo)(ctx, makeNode("DW", ["1", "2", "3"]));
        expect(ctx.texts[0].data).toEqual([1, 0, 2, 0, 3, 0]);
    });
    // 🧩 NEW: DS（Define Storage）
    test("DS allocates zero-filled bytes", () => {
        const ctx = makeCtx();
        (0, pseudo_1.handlePseudo)(ctx, makeNode("DS", ["8"]));
        const sec = ctx.sections.get(ctx.currentSection);
        expect(sec.bytes.length).toBe(8);
        expect(sec.bytes.every(b => b === 0)).toBe(true);
        expect(ctx.texts[0].data).toEqual(new Array(8).fill(0));
        expect(sec.lc).toBe(8);
    });
    // 🧩 NEW: 未解決シンボル（EXTERN式）
    test("DB with external symbol registers unresolved", () => {
        const ctx = makeCtx();
        // 🔹 parseExternExprをスタブ化して、外部参照と認識させる
        jest.spyOn(extern, "parseExternExpr").mockReturnValue({
            symbol: "EXT",
            addend: 1,
        });
        // 擬似的にparseExternExprが "EXT+1" のような形式を認識する前提
        (0, pseudo_1.handlePseudo)(ctx, makeNode("DB", ["EXT+1"]));
        console.log(ctx);
        expect(ctx.unresolved.length).toBe(1);
        const u = ctx.unresolved[0];
        expect(u.symbol).toBe("EXT");
        expect(u.addend).toBe(1);
        expect(u.size).toBe(1);
        expect(ctx.texts[0].data).toEqual([0x00]); // 仮データ
    });
    test("DW with external symbol registers unresolved", () => {
        const ctx = makeCtx();
        // 🔹 parseExternExprをスタブ化
        jest.spyOn(extern, "parseExternExpr").mockReturnValue({
            symbol: "EXT",
            addend: 0,
        });
        (0, pseudo_1.handlePseudo)(ctx, makeNode("DW", ["EXT"]));
        expect(ctx.unresolved.length).toBe(1);
        const u = ctx.unresolved[0];
        expect(u.symbol).toBe("EXT");
        expect(u.size).toBe(2);
        expect(u.addend).toBe(0);
        // 仮データが [00, 00]
        expect(ctx.texts[0].data).toEqual([0x00, 0x00]);
    });
    test("DS EXT1-$ registers unresolved (future support)", () => {
        const ctx = makeCtx();
        jest.spyOn(extern, "parseExternExpr").mockReturnValue({
            symbol: "EXT1",
            addend: 0,
        });
        (0, pseudo_1.handlePseudo)(ctx, makeNode("DS", ["EXT1-$"]));
        expect(ctx.unresolved.length).toBe(1);
        const u = ctx.unresolved[0];
        expect(u.symbol).toBe("EXT1");
        expect(u.size).toBe(0); // DS は実データ生成しない
    });
    test(".WORD32 with no operand sets flag", () => {
        const ctx = makeCtx();
        (0, pseudo_1.handlePseudo)(ctx, makeNode(".WORD32", []));
        expect(ctx.modeWord32).toBe(true);
    });
    test(".WORD32 with operand throws", () => {
        const ctx = makeCtx();
        expect(() => (0, pseudo_1.handlePseudo)(ctx, makeNode(".WORD32", ["100H"])))
            .toThrow(/does not take operands/);
    });
    test("DC sets bit7 on last character", () => {
        const ctx = makeCtx();
        (0, pseudo_1.handlePseudo)(ctx, makeNode("DC", ['"ABC"', '"Z"']));
        expect(ctx.texts[0].data).toEqual([0x41, 0x42, 0xC3, 0xDA]);
    });
});

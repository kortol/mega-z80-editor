"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assembleSource = assembleSource;
exports.assembleSourceMulti = assembleSourceMulti;
exports.phaseAnalyze = phaseAnalyze;
exports.phaseEmit = phaseEmit;
exports.getBytes = getBytes;
// packages/cli/src/assembler/testUtils.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mz80_as_1 = require("../cli/mz80-as");
const context_1 = require("./context");
const emit_1 = require("./codegen/emit");
const phaseManager_1 = require("./phaseManager");
const tokenizer_1 = require("./tokenizer");
const parser_1 = require("./parser");
const analyze_1 = require("./analyze");
const macro_1 = require("./macro");
const inspector_1 = require("inspector");
const crypto_1 = require("crypto");
/**
 * 簡易アセンブル関数。
 * 文字列ソースを一時ファイルに書き出し、CLI版assembleを呼び出す。
 *
 * デフォルト ("TEST") の場合は出力先も一時ディレクトリにリダイレクトする。
 */
function assembleSource(assemble, source, options, outfile = "TEST") {
    // 一時ディレクトリを確保
    const tmpDir = path_1.default.join(process.cwd(), ".tmp_tests." + (0, crypto_1.randomUUID)());
    if (!fs_1.default.existsSync(tmpDir))
        fs_1.default.mkdirSync(tmpDir, { recursive: true });
    // 入力用一時ASMファイル
    const tmpAsm = path_1.default.join(tmpDir, `${outfile}.asm`);
    fs_1.default.writeFileSync(tmpAsm, source.trim() + "\n", "utf-8");
    // 出力ファイル名を決定
    // outfile が "TEST" の場合は一時RELを使用
    const actualOutfile = outfile === "TEST" ? path_1.default.join(tmpDir, `${outfile}.rel`) : outfile;
    inspector_1.console.log(options);
    let ctx;
    try {
        // CLI版 assemble 実行
        // const ctx = assemble(tmpAsm, actualOutfile, { ...options, verbose: true });
        ctx = assemble(tmpAsm, actualOutfile, { ...options });
    }
    finally {
        // Cleanup: テストの邪魔にならないように削除
        try {
            fs_1.default.unlinkSync(tmpAsm);
            if (outfile === "TEST" && fs_1.default.existsSync(actualOutfile)) {
                fs_1.default.unlinkSync(actualOutfile);
            }
            // 一時ディレクトリも削除
            fs_1.default.rmdirSync(tmpDir);
        }
        catch {
            /* ignore */
        }
    }
    return ctx;
}
function assembleSourceMulti(phase, files, options) {
    // 🔹 仮想ファイルマップを作成
    const virtualFiles = new Map(Object.entries(files));
    // 🔹 起点ファイル（main.asm）を取得
    const mainSrc = files["main.asm"];
    if (!mainSrc) {
        throw new Error("assembleSourceMulti: missing entry 'main.asm'");
    }
    const ctx = assembleSource(phase, mainSrc, { ...options, virtualFiles });
    return ctx;
}
function phaseAnalyze(inputFile, outputFile, options) {
    const ctx = (0, context_1.createContext)({
        moduleName: "TEST",
        output: { relVersion: options?.relVersion ?? 1 },
        inputFile,
        options,
    });
    (0, emit_1.initCodegen)(ctx, { withDefaultSections: true });
    // PASS 0 : トークン化と構文解析
    const source = fs_1.default.readFileSync(inputFile, "utf-8");
    // --- PHASE: tokenize ---
    (0, phaseManager_1.setPhase)(ctx, "tokenize");
    ctx.tokens = (0, tokenizer_1.tokenize)(ctx, source);
    // --- PHASE: parse ---
    (0, phaseManager_1.setPhase)(ctx, "parse");
    if (options?.parser === "peg") {
        const { parsePeg } = require("../assembler/parser/pegAdapter");
        ctx.nodes = parsePeg(ctx, source);
    }
    else {
        ctx.nodes = (0, parser_1.parse)(ctx, ctx.tokens);
    }
    ctx.source = source;
    // --- 🧩 PHASE: macro-expand ---
    (0, phaseManager_1.setPhase)(ctx, "macroExpand");
    (0, macro_1.expandMacros)(ctx);
    // --- PHASE: analyze ---
    (0, phaseManager_1.setPhase)(ctx, "analyze");
    (0, analyze_1.runAnalyze)(ctx);
    return ctx;
}
function phaseEmit(inputFile, outputFile, options) {
    const ctx = (0, context_1.createContext)({
        moduleName: "TEST",
        output: { relVersion: options?.relVersion ?? 1 },
        inputFile,
        options,
    });
    (0, emit_1.initCodegen)(ctx, { withDefaultSections: true });
    // PASS 0 : トークン化と構文解析
    const source = fs_1.default.existsSync(inputFile)
        ? fs_1.default.readFileSync(inputFile, "utf-8")
        : ctx.options.virtualFiles?.get(inputFile) ?? "";
    // --- PHASE: tokenize ---
    (0, phaseManager_1.setPhase)(ctx, "tokenize");
    ctx.tokens = (0, tokenizer_1.tokenize)(ctx, source);
    // --- PHASE: parse ---
    (0, phaseManager_1.setPhase)(ctx, "parse");
    if (options?.parser === "peg") {
        const { parsePeg } = require("../assembler/parser/pegAdapter");
        ctx.nodes = parsePeg(ctx, source);
    }
    else {
        ctx.nodes = (0, parser_1.parse)(ctx, ctx.tokens);
    }
    ctx.source = source;
    // --- 🧩 PHASE: macro-expand ---
    (0, phaseManager_1.setPhase)(ctx, "macroExpand");
    (0, macro_1.expandMacros)(ctx);
    // --- PHASE: analyze ---
    (0, phaseManager_1.setPhase)(ctx, "analyze");
    (0, analyze_1.runAnalyze)(ctx);
    // console.log(ctx);
    // for (let n of ctx.nodes) {
    //   console.log(n);
    // }
    // --- PHASE: emit ---
    (0, phaseManager_1.setPhase)(ctx, "emit");
    (0, mz80_as_1.runEmit)(ctx);
    return ctx;
}
// 🔧 bytes 取得ヘルパ（他のマクロテストに合わせる）
function getBytes(ctx) {
    let bytes = [];
    for (const t of ctx.texts ?? []) {
        bytes = bytes.concat(t.data);
    }
    return bytes;
}

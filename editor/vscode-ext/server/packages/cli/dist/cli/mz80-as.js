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
exports.writeSymFile = writeSymFile;
exports.assemble = assemble;
exports.runEmit = runEmit;
exports.finalizeOutput = finalizeOutput;
const encoder_1 = require("../assembler/encoder");
const pseudo_1 = require("../assembler/pseudo");
const rel_1 = require("../assembler/rel");
const context_1 = require("../assembler/context");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const builder_1 = require("../assembler/rel/builder");
const emit_1 = require("../assembler/codegen/emit");
const phaseManager_1 = require("../assembler/phaseManager");
const listing_1 = require("../assembler/output/listing");
const sourceMap_1 = require("../assembler/output/sourceMap");
const analyze_1 = require("../assembler/analyze");
const macro_1 = require("../assembler/macro");
const pegAdapter_1 = require("../assembler/parser/pegAdapter");
const conditional_1 = require("../assembler/pseudo/conditional");
const model_1 = require("../sourcemap/model");
// --- .sym 出力 ---
function writeSymFile(ctx, outputFile) {
    const symPath = outputFile.replace(/\.rel$/i, ".sym");
    const lines = [];
    // シンボル名を集約：定義済み＋EXTERN
    const allNames = new Set([
        ...ctx.symbols.keys(),
        ...ctx.externs.values(),
    ]);
    // ソートして安定出力
    const entries = [...allNames].sort((a, b) => a.localeCompare(b));
    for (const name of entries) {
        let kind = "UNKNOWN";
        let valStr = "----";
        let fileStr = "-";
        if (ctx.externs.has(name)) {
            kind = "EXTERN";
        }
        else {
            const entry = ctx.symbols.get(name);
            if (typeof (entry?.value) === "number") {
                kind = ctx.exportSymbols.has(name) ? "GLOBAL" : "LABEL";
                valStr = entry.value.toString(16).padStart(4, "0");
                if (entry?.pos?.file)
                    fileStr = path.basename(entry.pos.file);
            }
        }
        lines.push(`${name.padEnd(8)} ${valStr.toUpperCase()}H ${kind} ${fileStr}`);
    }
    fs.writeFileSync(symPath, lines.join("\n") + "\n", "utf-8");
}
// // --- 追加: .lst 出力 ---
// function writeLstFile(ctx: AsmContext, outputFile: string, source: string) {
//   const lstPath = outputFile.replace(/\.rel$/i, ".lst");
//   const lines: string[] = [];
//   const srcLines = source.split(/\r?\n/);
//   // emit順を保証
//   const texts = [...ctx.texts].sort((a, b) => a.addr - b.addr);
//   for (const t of texts) {
//     const bytes = t.data
//       .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
//       .join(" ");
//     // --- line補完（undefined対策） ---
//     const lineNo = t.line && t.line > 0 ? t.line : 1;
//     const src = srcLines[lineNo - 1]?.trim() ?? "";
//     lines.push(
//       `${t.addr.toString(16).padStart(4, "0").toUpperCase()}  ${bytes.padEnd(12)}  ${src}`
//     );
//   }
//   fs.writeFileSync(lstPath, lines.join("\n") + "\n", "utf-8");
// }
// --- 本体 ---
function assemble(logger, inputFile, outputFile, options) {
    const verbose = options.verbose ?? false;
    const ctx = (0, context_1.createContext)({
        moduleName: path.basename(inputFile).replace(/\..*$/, "").toUpperCase(),
        output: { relVersion: options.relVersion ?? 1 },
        verbose,
        inputFile,
        logger,
        options,
    });
    if (options.symLen != null) {
        ctx.modeSymLen = options.symLen;
    }
    if (options.includePaths && options.includePaths.length > 0) {
        ctx.includePaths = [...options.includePaths];
    }
    (0, emit_1.initCodegen)(ctx, { withDefaultSections: true });
    // PASS 0 : トークン化と構文解析
    const source = fs.readFileSync(inputFile, "utf-8");
    ctx.currentPos.file = inputFile;
    ctx.currentPos.line = 0;
    ctx.sourceMap.set(inputFile, source.split(/\r?\n/));
    // --- PHASE: tokenize ---
    (0, phaseManager_1.setPhase)(ctx, "tokenize");
    ctx.tokens = [];
    // --- PHASE: parse ---
    (0, phaseManager_1.setPhase)(ctx, "parse");
    ctx.nodes = (0, pegAdapter_1.parsePeg)(ctx, source);
    ctx.source = source;
    // --- 🧩 PHASE: macro-expand (P2-E-03) ---
    (0, phaseManager_1.setPhase)(ctx, "macroExpand");
    (0, macro_1.expandMacros)(ctx); // ← ここを追加！
    // --- PHASE: analyze ---
    (0, phaseManager_1.setPhase)(ctx, "analyze");
    (0, analyze_1.runAnalyze)(ctx);
    // --- PHASE: emit ---
    (0, phaseManager_1.setPhase)(ctx, "emit");
    runEmit(ctx);
    // --- PHASE: link（内部リンク相当） ---
    (0, phaseManager_1.setPhase)(ctx, "link");
    finalizeOutput(ctx, outputFile, options?.relVersion ?? 1);
    return ctx;
}
// export function runAnalyze(ctx: AsmContext) {
//   ctx.loc = 0;
//   for (const node of ctx.nodes ?? []) {
//     switch (node.kind) {
//       case "label":
//         defineSymbol(ctx, node.name, ctx.loc, "LABEL");
//         break;
//       case "pseudo":
//         handlePseudo(ctx, node);  // EQU などはここで確定
//         break;
//       case "instr":
//         ctx.loc += estimateInstrSize(ctx, node);
//         break;
//     }
//   }
// }
function runEmit(ctx) {
    const analyzeErrors = ctx.errors.slice();
    const analyzeWarnings = ctx.warnings.slice();
    runEmitPass(ctx);
    // 1st pass diagnostics are only for label/address priming.
    ctx.errors = analyzeErrors;
    ctx.warnings = analyzeWarnings;
    runEmitPass(ctx);
}
function runEmitPass(ctx) {
    ctx.loc = 0;
    ctx.texts = [];
    ctx.relocs = [];
    ctx.unresolved = [];
    ctx.condStack = [];
    ctx.listing = [];
    for (const sec of ctx.sections.values()) {
        sec.lc = sec.orgDefined ? (sec.org ?? 0) : 0;
        sec.bytes = [];
    }
    for (const node of ctx.nodes ?? []) {
        if (node.kind === "empty")
            continue;
        const beforeTexts = ctx.texts.length;
        const addr = ctx.loc;
        const sectionId = ctx.currentSection;
        let skipListing = false;
        switch (node.kind) {
            case "label":
                if (!(0, conditional_1.isConditionActive)(ctx)) {
                    skipListing = true;
                    break;
                }
                if (!node.name.startsWith(".")) {
                    ctx.currentGlobalLabel = (0, context_1.canon)(node.name, ctx);
                }
                {
                    const key = (0, context_1.canon)(node.name.startsWith(".") && ctx.currentGlobalLabel
                        ? `${ctx.currentGlobalLabel}${node.name}`
                        : node.name, ctx);
                    ctx.symbols.set(key, {
                        value: ctx.loc,
                        sectionId: ctx.currentSection,
                        type: "LABEL",
                        pos: node.pos,
                    });
                }
                break;
            case "pseudo":
                if ((0, conditional_1.isConditionalOp)(node.op)) {
                    (0, conditional_1.handleConditional)(ctx, node);
                    skipListing = true;
                    break;
                }
                if (!(0, conditional_1.isConditionActive)(ctx)) {
                    skipListing = true;
                    break;
                }
                const pseudoOp = node.op.toUpperCase();
                if (pseudoOp === "INCLUDE" || pseudoOp === "SECTION") {
                    skipListing = true;
                }
                (0, pseudo_1.handlePseudo)(ctx, node);
                break;
            case "instr":
                if (!(0, conditional_1.isConditionActive)(ctx)) {
                    skipListing = true;
                    break;
                }
                (0, encoder_1.encodeInstr)(ctx, node);
                break;
        }
        if (skipListing)
            continue;
        if (!ctx.listingControl.enabled)
            continue;
        const newTexts = ctx.texts.slice(beforeTexts);
        if (newTexts.length > 0) {
            for (const t of newTexts) {
                ctx.listing.push({
                    addr: t.addr,
                    bytes: t.data,
                    pos: t.pos,
                    sectionId: t.sectionId,
                });
            }
            continue;
        }
        // no bytes emitted -> listing entry for label/pseudo
        if (node.kind === "label") {
            ctx.listing.push({
                addr,
                bytes: [],
                pos: node.pos,
                sectionId,
                text: `${node.name}:`,
                kind: "label",
            });
        }
        else if (node.kind === "pseudo") {
            ctx.listing.push({
                addr,
                bytes: [],
                pos: node.pos,
                sectionId,
                kind: "pseudo",
            });
        }
    }
}
// ------------------------------------------------------------
// 出力フェーズ
// ------------------------------------------------------------
function finalizeOutput(ctx, outputFile, relVersion) {
    if (relVersion === 2) {
        // v2 Writer 経由で出力
        (0, builder_1.emitRelV2)(ctx, outputFile);
    }
    else {
        const rel = (0, rel_1.emitRel)(ctx); // 従来どおり
        fs.writeFileSync(outputFile, rel, "utf-8");
        ctx.output.relSize = rel.length;
        ctx.output.relVersion = 1;
        ctx.output.generatedAt = new Date();
    }
    // SYM 出力
    if (ctx.options.sym) {
        writeSymFile(ctx, outputFile);
    }
    ctx.logger?.info(`relVersion:${relVersion}`);
    // LST 出力
    if (ctx.options.lst) {
        if (relVersion === 2) {
            (0, listing_1.writeLstFileV2)(ctx, outputFile, ctx.source ?? '');
        }
        else {
            (0, listing_1.writeLstFile)(ctx, outputFile, ctx.source ?? '');
        }
    }
    if (ctx.options.smap) {
        const smapPath = outputFile.replace(/\.rel$/i, ".smap");
        const smap = (0, sourceMap_1.buildAssemblerSourceMap)(ctx, ctx.inputFile, outputFile);
        (0, model_1.writeSourceMap)(smapPath, smap);
    }
    // ------------------------------------------------------------
    // Verbose出力
    // ------------------------------------------------------------
    if (ctx.verbose) {
        ctx.logger?.info("────────── Assembler Verbose Report ──────────");
        ctx.logger?.info(`Input : ${ctx.inputFile}`);
        ctx.logger?.info(`Output: ${outputFile}`);
        ctx.logger?.info(`Symbols: ${[...ctx.symbols.keys()].join(", ")}`);
        ctx.logger?.info(`Externs: ${[...ctx.externs.values()].join(", ") || "(none)"}`);
        ctx.logger?.info(`Errors : ${ctx.errors.length}`);
        ctx.logger?.info(`Texts  : ${ctx.texts.length} records`);
        ctx.logger?.info(`Output size: ${ctx.output.relSize} bytes`);
        ctx.logger?.info("───────────────────────────────────────────────");
        if (ctx.errors.length > 0) {
            for (const e of ctx.errors) {
                ctx.logger?.info(`E${e.code ?? "----"}: ${e.message ?? "unknown"} (line ${e.pos?.line ?? "?"})`);
            }
        }
    }
    return ctx;
}

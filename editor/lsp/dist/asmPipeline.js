"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.silentLogger = void 0;
exports.documentUriToInputFile = documentUriToInputFile;
exports.createPipeline = createPipeline;
exports.runAnalysis = runAnalysis;
exports.runEmitPass = runEmitPass;
const node_path_1 = require("node:path");
const node_url_1 = require("node:url");
const { createAsmContext } = require("../../../packages/cli/dist/assembler/context.js");
const { tokenize } = require("../../../packages/cli/dist/assembler/tokenizer.js");
const { parsePeg } = require("../../../packages/cli/dist/assembler/parser/pegAdapter.js");
const { expandMacros } = require("../../../packages/cli/dist/assembler/macro.js");
const { runAnalyze } = require("../../../packages/cli/dist/assembler/analyze.js");
const { initCodegen } = require("../../../packages/cli/dist/assembler/codegen/emit.js");
const { setPhase } = require("../../../packages/cli/dist/assembler/phaseManager.js");
const { runEmit } = require("../../../packages/cli/dist/cli/mz80-as.js");
exports.silentLogger = {
    info: () => { },
    debug: () => { },
    warn: () => { },
    error: () => { },
};
function documentUriToInputFile(uri) {
    if (!uri.startsWith("file:"))
        return uri;
    try {
        return (0, node_url_1.fileURLToPath)(uri);
    }
    catch {
        return uri;
    }
}
function createPipeline(document) {
    const inputFile = documentUriToInputFile(document.uri);
    const source = document.getText();
    const includePaths = inputFile.includes(":") || inputFile.startsWith("\\")
        ? [(0, node_path_1.dirname)(inputFile)]
        : [];
    const ctx = createAsmContext({
        inputFile,
        moduleName: (0, node_path_1.basename)(inputFile).replace(/\..*$/u, "").toUpperCase() || "LSP",
        logger: exports.silentLogger,
        currentPos: {
            file: inputFile,
            line: 0,
            column: 0,
            phase: "tokenize",
        },
        options: {
            includePaths,
            virtualFiles: new Map([[inputFile, source]]),
        },
    });
    initCodegen(ctx, { withDefaultSections: true });
    ctx.source = source;
    ctx.sourceMap.set(inputFile, source.split(/\r?\n/u));
    setPhase(ctx, "tokenize");
    ctx.tokens = tokenize(ctx, source);
    const tokens = [...ctx.tokens];
    setPhase(ctx, "parse");
    ctx.nodes = parsePeg(ctx, source);
    const parsedNodes = [...ctx.nodes];
    return {
        ctx,
        inputFile,
        source,
        parsedNodes,
        tokens,
    };
}
function runAnalysis(pipeline) {
    const { ctx } = pipeline;
    setPhase(ctx, "macroExpand");
    expandMacros(ctx);
    setPhase(ctx, "analyze");
    runAnalyze(ctx);
}
function runEmitPass(pipeline) {
    const { ctx } = pipeline;
    setPhase(ctx, "emit");
    runEmit(ctx);
}

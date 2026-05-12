"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectDiagnostics = collectDiagnostics;
const node_js_1 = require("vscode-languageserver/node.js");
const asmPipeline_1 = require("./asmPipeline");
function clampRange(document, pos) {
    if (!pos) {
        return {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
        };
    }
    const lineCount = Math.max(1, document.lineCount);
    const line = Math.max(0, Math.min(pos.line ?? 0, lineCount - 1));
    const lineText = document.getText({
        start: { line, character: 0 },
        end: { line: Math.min(line + 1, lineCount), character: 0 },
    });
    const maxChar = Math.max(0, lineText.replace(/[\r\n]+$/u, "").length);
    const startChar = Math.max(0, Math.min(pos.column ?? 0, maxChar));
    const endChar = Math.min(maxChar, startChar + 1);
    return {
        start: { line, character: startChar },
        end: { line, character: endChar > startChar ? endChar : startChar + 1 },
    };
}
function toDiagnostic(document, err, severity) {
    return {
        severity,
        range: clampRange(document, err.pos),
        message: err.message,
        source: "mz80",
        code: err.code,
    };
}
function toUnexpectedDiagnostic(document, err) {
    const message = err instanceof Error
        ? err.message
        : typeof err === "object" && err && "message" in err
            ? String(err.message)
            : String(err);
    const pos = typeof err === "object" && err && "pos" in err
        ? err.pos
        : undefined;
    return toDiagnostic(document, { message, pos }, node_js_1.DiagnosticSeverity.Error);
}
function sameDiagnosticKey(err) {
    const file = err.pos?.file ?? "";
    const line = err.pos?.line ?? -1;
    const column = err.pos?.column ?? -1;
    return [err.code ?? "", err.message, file, line, column].join("|");
}
function collectNewDiagnostics(previous, current, filter) {
    const seen = new Set(previous.map(sameDiagnosticKey));
    return current.filter((err) => {
        if (seen.has(sameDiagnosticKey(err)))
            return false;
        return filter ? filter(err) : true;
    });
}
function isEmitRedefinitionNoise(err) {
    return err.code === "A3102" || err.message.startsWith("Symbol redefined:");
}
function maybeForwardReference(ctx, err) {
    if (err.code !== "A2100")
        return false;
    const match = /^Undefined symbol: (.+)$/u.exec(err.message);
    if (!match)
        return false;
    const raw = match[1].trim();
    const key = ctx.options.caseSensitive ? raw : raw.toUpperCase();
    return ctx.symbols.has(key) || ctx.externs.has(key);
}
function collectDiagnostics(document) {
    const pipeline = (0, asmPipeline_1.createPipeline)(document);
    const { ctx } = pipeline;
    try {
        (0, asmPipeline_1.runAnalysis)(pipeline);
        ctx.errors = ctx.errors.filter((err) => !maybeForwardReference(ctx, err));
        const analyzeErrors = [...ctx.errors];
        const analyzeWarnings = [...ctx.warnings];
        (0, asmPipeline_1.runEmitPass)(pipeline);
        const emitErrors = collectNewDiagnostics(analyzeErrors, ctx.errors, (err) => !maybeForwardReference(ctx, err));
        const emitWarnings = collectNewDiagnostics(analyzeWarnings, ctx.warnings, (err) => !isEmitRedefinitionNoise(err));
        return [
            ...analyzeErrors.map((err) => toDiagnostic(document, err, node_js_1.DiagnosticSeverity.Error)),
            ...emitErrors.map((err) => toDiagnostic(document, err, node_js_1.DiagnosticSeverity.Error)),
            ...analyzeWarnings.map((warn) => toDiagnostic(document, warn, node_js_1.DiagnosticSeverity.Warning)),
            ...emitWarnings.map((warn) => toDiagnostic(document, warn, node_js_1.DiagnosticSeverity.Warning)),
        ];
    }
    catch (err) {
        return [toUnexpectedDiagnostic(document, err)];
    }
}

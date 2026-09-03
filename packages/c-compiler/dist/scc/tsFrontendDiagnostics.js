"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TsFrontendError = void 0;
exports.createDiagnostic = createDiagnostic;
exports.throwDiagnostic = throwDiagnostic;
exports.formatDiagnostic = formatDiagnostic;
exports.formatDiagnostics = formatDiagnostics;
class TsFrontendError extends Error {
    diagnostics;
    constructor(diagnostics) {
        super(formatDiagnostics(diagnostics));
        this.name = "TsFrontendError";
        this.diagnostics = diagnostics;
    }
}
exports.TsFrontendError = TsFrontendError;
function createDiagnostic(sourceText, message, opts = {}) {
    const offset = clampOffset(sourceText, opts.offset ?? 0);
    const { line, column } = computeLineColumn(sourceText, offset);
    return {
        message,
        file: opts.file,
        offset,
        line,
        column,
    };
}
function throwDiagnostic(sourceText, message, opts = {}) {
    throw new TsFrontendError([createDiagnostic(sourceText, message, opts)]);
}
function formatDiagnostic(diagnostic) {
    const location = diagnostic.file
        ? `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`
        : `${diagnostic.line}:${diagnostic.column}`;
    return `${location}: ${diagnostic.message}`;
}
function formatDiagnostics(diagnostics) {
    return diagnostics.map(formatDiagnostic).join("\n");
}
function computeLineColumn(sourceText, offset) {
    let line = 1;
    let column = 1;
    for (let index = 0; index < offset; index += 1) {
        if (sourceText[index] === "\n") {
            line += 1;
            column = 1;
            continue;
        }
        column += 1;
    }
    return { line, column };
}
function clampOffset(sourceText, offset) {
    if (offset < 0) {
        return 0;
    }
    if (offset > sourceText.length) {
        return sourceText.length;
    }
    return offset;
}

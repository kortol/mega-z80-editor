"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogAdapter = void 0;
// src/linker/output/logAdapter.ts
const baseTextAdapter_1 = require("./common/baseTextAdapter");
class LogAdapter extends baseTextAdapter_1.BaseTextAdapter {
    result;
    warnings;
    ext = ".log";
    tag = "[LOG]";
    constructor(result, warnings = []) {
        super();
        this.result = result;
        this.warnings = warnings;
    }
    generateText() {
        const lines = ["LINK REPORT", "------------"];
        const segCount = this.result.segments.length;
        const symCount = this.result.symbols.size;
        const entry = this.result.entry !== undefined
            ? `${this.result.entry.toString(16).toUpperCase().padStart(4, "0")}H`
            : "(none)";
        lines.push(`Segments: ${segCount}`);
        lines.push(`Symbols: ${symCount}`);
        lines.push(`Entry: ${entry}`);
        if (this.warnings.length > 0) {
            lines.push("", "WARNINGS:");
            this.warnings.forEach((msg, i) => lines.push(`  [W${(i + 1).toString().padStart(3, "0")}] ${msg}`));
        }
        else {
            lines.push("", "No warnings.");
        }
        return lines.join("\n");
    }
}
exports.LogAdapter = LogAdapter;

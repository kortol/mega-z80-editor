"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SymAdapter = void 0;
const baseTextAdapter_1 = require("./common/baseTextAdapter");
class SymAdapter extends baseTextAdapter_1.BaseTextAdapter {
    result;
    ext = ".sym";
    tag = "[SYM]";
    constructor(result) {
        super();
        this.result = result;
    }
    generateText() {
        const lines = ["SYMBOL TABLE", "------------"];
        const entries = [...this.result.symbols.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]));
        for (const [name, sym] of entries) {
            const addr = sym.addr !== undefined
                ? `${sym.addr.toString(16).toUpperCase().padStart(4, "0")}H`
                : "----H";
            lines.push(`${name.padEnd(8)} ${addr}${sym.addr === undefined ? "   (UNDEF)" : ""}`);
        }
        return lines.join("\n");
    }
}
exports.SymAdapter = SymAdapter;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinOutputAdapter = void 0;
const baseTextAdapter_1 = require("./common/baseTextAdapter");
class BinOutputAdapter extends baseTextAdapter_1.BaseTextAdapter {
    result;
    ext = ".abs";
    tag = "[BIN]";
    constructor(result) {
        super();
        this.result = result;
    }
    generateText() {
        if (this.result.segments.length === 0)
            throw new Error("No segments");
        const seg = this.result.segments[0];
        if (!seg.data)
            throw new Error("Segment has no data");
        // HEX表現を生成（16バイト単位）
        const lines = [];
        for (let i = 0; i < seg.data.length; i += 16) {
            const chunk = seg.data.slice(i, i + 16);
            const addr = (seg.range.min + i).toString(16).padStart(4, "0").toUpperCase();
            const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
            lines.push(`${addr}: ${hex}`);
        }
        return lines.join("\n");
    }
}
exports.BinOutputAdapter = BinOutputAdapter;

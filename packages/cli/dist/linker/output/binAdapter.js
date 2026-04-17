"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinOutputAdapter = void 0;
const baseTextAdapter_1 = require("./common/baseTextAdapter");
const outputUtils_1 = require("./common/outputUtils");
class BinOutputAdapter extends baseTextAdapter_1.BaseTextAdapter {
    result;
    opts;
    ext = ".abs";
    tag = "[BIN]";
    constructor(result, opts = {}) {
        super();
        this.result = result;
        this.opts = opts;
    }
    getLoadableSegments() {
        if (this.result.segments.length === 0)
            throw new Error("No segments");
        const loadable = this.result.segments
            .filter((seg) => !!seg.data)
            .map((seg) => ({ range: seg.range, data: seg.data }));
        if (loadable.length === 0)
            throw new Error("No loadable segments");
        return loadable;
    }
    resolveRange(segments) {
        const minAddr = Math.min(...segments.map((s) => s.range.min));
        const maxAddr = Math.max(...segments.map((s) => s.range.max));
        let from = this.opts.binFrom ?? minAddr;
        let to = this.opts.binTo ?? maxAddr;
        if (this.opts.com) {
            from = Math.max(from, 0x0100);
        }
        if (from < 0)
            from = 0;
        if (to > 0xffff)
            to = 0xffff;
        if (to < from) {
            throw new Error(`Invalid binary range: from=${from.toString(16)} to=${to.toString(16)}`);
        }
        return { from, to };
    }
    generateText() {
        const segments = this.getLoadableSegments();
        const { from, to } = this.resolveRange(segments);
        const len = to - from + 1;
        const out = new Uint8Array(len);
        for (const seg of segments) {
            const segStart = seg.range.min;
            const segEnd = Math.min(seg.range.max, segStart + seg.data.length - 1);
            const copyFrom = Math.max(from, segStart);
            const copyTo = Math.min(to, segEnd);
            if (copyFrom <= copyTo) {
                out.set(seg.data.slice(copyFrom - segStart, copyTo - segStart + 1), copyFrom - from);
            }
        }
        return out;
    }
    generateDumpText() {
        const segments = this.getLoadableSegments();
        const { from, to } = this.resolveRange(segments);
        const data = this.generateText();
        const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
        // HEX表現を生成（16バイト単位）
        const lines = [];
        for (let i = 0; i < buf.length; i += 16) {
            const chunk = buf.slice(i, i + 16);
            const addr = (from + i).toString(16).padStart(4, "0").toUpperCase();
            const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
            lines.push(`${addr}: ${hex}`);
        }
        return lines.join("\n");
    }
    write(targetFile, verbose = false) {
        const bin = this.generateText();
        (0, outputUtils_1.writeOutputFile)(targetFile, bin, verbose, this.tag);
        // Keep a text dump next to .com outputs for debugging parity.
        if (/\.com$/i.test(targetFile)) {
            const dump = this.generateDumpText();
            (0, outputUtils_1.writeOutputFile)(`${targetFile}.dmp`, dump, verbose, "[DMP]");
        }
    }
}
exports.BinOutputAdapter = BinOutputAdapter;

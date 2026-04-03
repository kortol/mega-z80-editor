"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapAdapter = void 0;
const baseTextAdapter_1 = require("./common/baseTextAdapter");
const outputUtils_1 = require("./common/outputUtils");
/**
 * M80スタイルのMAPファイルを出力するアダプタ
 */
class MapAdapter extends baseTextAdapter_1.BaseTextAdapter {
    result;
    ext = ".map";
    tag = "[MAP]";
    constructor(result) {
        super();
        this.result = result;
    }
    generateText() {
        const lines = [];
        lines.push("LINK MAP OF OUTPUT");
        lines.push("---------------------------------");
        // --- シンボル一覧
        const entries = [...this.result.symbols.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]));
        for (const [name, { bank, addr }] of entries) {
            const isUnresolved = addr === 0;
            const mark = isUnresolved ? "?" : "@";
            const addrStr = isUnresolved
                ? "----H"
                : addr.toString(16).toUpperCase().padStart(4, "0") + "H";
            lines.push(`${mark}${name.padEnd(8)} ${addrStr}   BANK${bank}`);
        }
        // --- セグメント情報
        lines.push("SEGMENTS:");
        for (const seg of this.result.segments) {
            const size = seg.range.max - seg.range.min + 1;
            const human = (0, outputUtils_1.formatHumanSize)(size);
            lines.push(`  [${seg.kind}] ${seg.range.min.toString(16).padStart(4, "0")}H..${seg.range.max
                .toString(16)
                .padStart(4, "0")}H size=${size.toString(16).toUpperCase().padStart(4, "0")}H (${human})`);
        }
        // --- エントリ
        if (this.result.entry !== undefined) {
            lines.push(`ENTRY: ${this.result.entry.toString(16).toUpperCase().padStart(4, "0")}H`);
        }
        return lines.join("\n");
    }
}
exports.MapAdapter = MapAdapter;

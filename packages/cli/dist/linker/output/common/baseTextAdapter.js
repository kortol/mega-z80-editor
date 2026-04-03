"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseTextAdapter = void 0;
const outputUtils_1 = require("./outputUtils");
class BaseTextAdapter {
    /**
     * 出力実行
     */
    write(targetFile, verbose = false) {
        const text = this.generateText();
        (0, outputUtils_1.writeOutputFile)(targetFile, text, verbose, this.tag);
    }
    /**
     * 共通ユーティリティ：サイズログ文字列
     */
    formatSize(data) {
        return (0, outputUtils_1.formatHumanSize)(typeof data === "string" ? Buffer.byteLength(data, "utf-8") : data.length);
    }
}
exports.BaseTextAdapter = BaseTextAdapter;

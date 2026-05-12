"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.replaceExt = replaceExt;
exports.writeOutputFile = writeOutputFile;
exports.formatHumanSize = formatHumanSize;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * 拡張子を安全に置き換える。
 * @example replaceExt("foo.abs", ".map") → "foo.map"
 */
function replaceExt(file, newExt) {
    return path_1.default.join(path_1.default.dirname(file), path_1.default.basename(file, path_1.default.extname(file)) + newExt);
}
/**
 * テキストまたはバイナリを出力し、verbose時にログを出力。
 */
function writeOutputFile(target, text, verbose = false, tag = "[TEXT]") {
    const buf = typeof text === "string" ? Buffer.from(text, "utf-8") : text;
    fs_1.default.writeFileSync(target, buf);
    if (verbose) {
        const size = buf.length;
        const sizeStr = formatHumanSize(size);
        if (`${size} bytes` === sizeStr) {
            // bytes未満なら省略
            console.log(`${tag} ${target} (${sizeStr})`);
        }
        else {
            console.log(`${tag} ${target} (${size} bytes / ${sizeStr})`);
        }
    }
}
/**
 * バイトサイズをヒューマンフレンドリー表記に変換する。
 * - 有効桁数2桁、切り捨て
 * - 512 bytes 未満は整数表記
 * - 512〜1023 bytes は 0.xx KB
 * - 1〜9.99 KB は小数2桁、10KB〜99.9KB は小数1桁
 * - 1MB 以上は小数2桁（切り捨て）
 */
function formatHumanSize(size) {
    if (size < 512) {
        return `${size} bytes`;
    }
    else if (size < 1024) {
        const truncated = Math.floor((size / 1024) * 100) / 100;
        return `${truncated.toFixed(2)} KB`;
    }
    else if (size < 1024 * 1024) {
        const kb = size / 1024;
        const truncated = kb < 10
            ? Math.floor(kb * 100) / 100 // 2桁
            : Math.floor(kb * 10) / 10; // 1桁
        return `${truncated.toFixed(kb < 10 ? 2 : 1)} KB`;
    }
    else {
        const mb = size / 1024 / 1024;
        const truncated = Math.floor(mb * 100) / 100;
        return `${truncated.toFixed(2)} MB`;
    }
}

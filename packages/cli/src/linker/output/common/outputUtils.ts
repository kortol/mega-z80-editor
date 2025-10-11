import fs from "fs";
import path from "path";

/**
 * 拡張子を安全に置き換える。
 * @example replaceExt("foo.abs", ".map") → "foo.map"
 */
export function replaceExt(file: string, newExt: string): string {
  return path.join(
    path.dirname(file),
    path.basename(file, path.extname(file)) + newExt
  );
}

/**
 * テキストファイルを書き出す（UTF-8固定）
 */
export function writeTextFile(
  target: string,
  text: string,
  verbose = false
): void {
  fs.writeFileSync(target, text, "utf-8");
  if (verbose) {
    console.log(`[TEXT] ${target} (${text.length} chars)\n${text}`);
  }
}

/**
 * バイナリファイルを書き出す（ヒューマンフレンドリーサイズ併記）
 */
export function writeBinaryFile(
  target: string,
  data: Uint8Array,
  verbose = false
): void {
  fs.writeFileSync(target, data);
  if (verbose) {
    const size = data.length;
    const human = formatHumanSize(size);
    console.log(`[BIN] ${target} (${size} bytes / ${human})`);
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
export function formatHumanSize(size: number): string {
  if (size < 512) {
    return `${size} bytes`;
  } else if (size < 1024) {
    const truncated = Math.floor((size / 1024) * 100) / 100;
    return `${truncated.toFixed(2)} KB`;
  } else if (size < 1024 * 1024) {
    const kb = size / 1024;
    const truncated =
      kb < 10
        ? Math.floor(kb * 100) / 100 // 2桁
        : Math.floor(kb * 10) / 10; // 1桁
    return `${truncated.toFixed(kb < 10 ? 2 : 1)} KB`;
  } else {
    const mb = size / 1024 / 1024;
    const truncated = Math.floor(mb * 100) / 100;
    return `${truncated.toFixed(2)} MB`;
  }
}

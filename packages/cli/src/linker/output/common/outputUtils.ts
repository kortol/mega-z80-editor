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
 * テキストまたはバイナリを出力し、verbose時にログを出力。
 */
export function writeOutputFile(
  target: string,
  text: string | Uint8Array,
  verbose = false,
  tag = "[TEXT]"
): void {
  const buf = typeof text === "string" ? Buffer.from(text, "utf-8") : text;
  fs.writeFileSync(target, buf);

  if (verbose) {
    const size = buf.length;
    const sizeStr = formatHumanSize(size);
    if (`${size} bytes` === sizeStr) {
      // bytes未満なら省略
      console.log(`${tag} ${target} (${sizeStr})`);
    } else {
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

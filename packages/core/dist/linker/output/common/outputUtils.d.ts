/**
 * 拡張子を安全に置き換える。
 * @example replaceExt("foo.abs", ".map") → "foo.map"
 */
export declare function replaceExt(file: string, newExt: string): string;
/**
 * テキストまたはバイナリを出力し、verbose時にログを出力。
 */
export declare function writeOutputFile(target: string, text: string | Uint8Array, verbose?: boolean, tag?: string): void;
/**
 * バイトサイズをヒューマンフレンドリー表記に変換する。
 * - 有効桁数2桁、切り捨て
 * - 512 bytes 未満は整数表記
 * - 512〜1023 bytes は 0.xx KB
 * - 1〜9.99 KB は小数2桁、10KB〜99.9KB は小数1桁
 * - 1MB 以上は小数2桁（切り捨て）
 */
export declare function formatHumanSize(size: number): string;

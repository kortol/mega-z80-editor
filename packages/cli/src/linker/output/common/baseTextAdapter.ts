import { OutputAdapter } from "../types";
import { formatHumanSize, writeOutputFile } from "./outputUtils";

export abstract class BaseTextAdapter {
  /** 拡張子（例: ".map"） */
  readonly abstract ext: string;

  /** verbose時に表示するタグ（例: "[MAP]"） */
  readonly abstract tag: string;

  /**
   * サブクラスでオーバーライドして出力内容を構築する。
   */
  abstract generateText(): string | Uint8Array;

  /**
   * 出力実行
   */
  write(targetFile: string, verbose = false): void {
    const text = this.generateText();
    writeOutputFile(targetFile, text, verbose, this.tag);
    if (verbose) {
      const size = this.formatSize(text);
      console.log(`${this.tag} ${targetFile} (${size})`);
    }
  }

  /**
   * 共通ユーティリティ：サイズログ文字列
   */
  protected formatSize(data: string | Uint8Array): string {
    return formatHumanSize(
      typeof data === "string" ? Buffer.byteLength(data, "utf-8") : data.length
    );
  }
}

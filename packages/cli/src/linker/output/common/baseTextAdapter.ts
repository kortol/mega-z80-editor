import { formatHumanSize, writeTextFile } from "./outputUtils";

export abstract class BaseTextAdapter {
  /** 拡張子（例: ".map"） */
  abstract ext: string;

  /** verbose時に表示するタグ（例: "[MAP]"） */
  abstract tag: string;

  /**
   * サブクラスでオーバーライドして出力内容を構築する。
   */
  abstract generateText(): string;

  /**
   * 出力実行
   */
  write(targetFile: string, verbose = false): void {
    const text = this.generateText();
    writeTextFile(targetFile, text, verbose);
    if (verbose) {
      const size = this.formatSize(text);
      console.log(`${this.tag} ${targetFile} (${size})`);
    }
  }

  /**
   * 共通ユーティリティ：サイズログ文字列
   */
  protected formatSize(data: string | Buffer): string {
    return formatHumanSize(
      typeof data === "string" ? Buffer.byteLength(data, "utf-8") : data.length
    );
  }
}

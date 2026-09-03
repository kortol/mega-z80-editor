export declare abstract class BaseTextAdapter {
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
    write(targetFile: string, verbose?: boolean): void;
    /**
     * 共通ユーティリティ：サイズログ文字列
     */
    protected formatSize(data: string | Uint8Array): string;
}

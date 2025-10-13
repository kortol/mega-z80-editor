// 共通OutputAdapter定義（BaseTextAdapterの抽象I/F）
export interface OutputAdapter {
  /** 出力ファイル拡張子（例: .abs, .map, .sym, .log） */
  readonly ext: string;

  /** 出力ログタグ（例: [BIN], [MAP], [SYM], [LOG]） */
  readonly tag: string;

  /**
   * 出力実行メソッド
   * @param filePath 出力先パス
   * @param verbose trueならファイル情報をログ出力
   */
  write(filePath: string, verbose?: boolean): void;
}

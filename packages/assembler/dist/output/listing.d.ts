import { AsmContext } from "../context";
/**
 * `.lst` ファイル出力（従来形式）
 * - 各行：アドレス＋ダンプ＋ソース
 * - INCLUDEコメントやセクション見出しなし（v1互換）
 */
export declare function writeLstFile(ctx: AsmContext, outputFile: string, source: string): void;
/**
 * `.lst` ファイル出力（新形式 / v2仕様）
 * INCLUDE展開を可視化し、可読性を高める。
 */
export declare function writeLstFileV2(ctx: AsmContext, outputFile: string, _source: string): void;

import { AsmOptions, type AsmContext } from "./context";
/**
 * 簡易アセンブル関数。
 * 文字列ソースを一時ファイルに書き出し、CLI版assembleを呼び出す。
 *
 * デフォルト ("TEST") の場合は出力先も一時ディレクトリにリダイレクトする。
 */
export declare function assembleSource(assemble: (inputFile: string, outputFile: string, options?: AsmOptions) => AsmContext, source: string, options?: AsmOptions, outfile?: string): AsmContext;
export declare function assembleSourceMulti(phase: any, files: Record<string, string>, options?: any): AsmContext;
export declare function phaseAnalyze(inputFile: string, outputFile: string, options?: AsmOptions): AsmContext;
export declare function phaseEmit(inputFile: string, outputFile: string, options?: AsmOptions): AsmContext;
export declare function getBytes(ctx: AsmContext): number[];

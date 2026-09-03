import { BaseTextAdapter } from "./common/baseTextAdapter";
import { LinkResult } from "../core/types";
type FullpathMode = "off" | "rel" | "on";
/**
 * sjasm labelslist互換に寄せた MAP ファイルを出力するアダプタ
 */
export declare class MapAdapter extends BaseTextAdapter {
    private result;
    private options;
    readonly ext = ".map";
    readonly tag = "[MAP]";
    constructor(result: LinkResult, options?: {
        fullpath?: FullpathMode;
        cwd?: string;
    });
    private formatSymbolLine;
    private buildAutoSymbols;
    generateText(): string;
    private shortenDefinedAt;
    private getBaseDir;
}
export {};

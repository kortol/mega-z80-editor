import { BaseTextAdapter } from "./common/baseTextAdapter";
import { LinkResult } from "../core/types";
export declare class BinOutputAdapter extends BaseTextAdapter {
    private result;
    private opts;
    readonly ext = ".abs";
    readonly tag = "[BIN]";
    constructor(result: LinkResult, opts?: {
        com?: boolean;
        binFrom?: number;
        binTo?: number;
    });
    private getLoadableSegments;
    private resolveRange;
    generateText(): string | Uint8Array;
    generateDumpText(): string;
    write(targetFile: string, verbose?: boolean): void;
}

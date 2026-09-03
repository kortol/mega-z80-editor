import { BaseTextAdapter } from "./common/baseTextAdapter";
import { LinkResult } from "../core/types";
export declare class LogAdapter extends BaseTextAdapter {
    private result;
    private warnings;
    readonly ext = ".log";
    readonly tag = "[LOG]";
    constructor(result: LinkResult, warnings?: string[]);
    generateText(): string;
}

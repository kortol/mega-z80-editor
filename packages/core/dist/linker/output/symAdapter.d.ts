import { BaseTextAdapter } from "./common/baseTextAdapter";
import { LinkResult } from "../core/types";
export declare class SymAdapter extends BaseTextAdapter {
    private result;
    readonly ext = ".sym";
    readonly tag = "[SYM]";
    constructor(result: LinkResult);
    generateText(): string;
}

import { AsmContext, RequesterInfo, SourcePos } from "../context";
/**
 * Codegen/Emit API
 * ---------------------------------------------------------
 * Assemblerが実際に「バイト列を出力」「Fixupを登録」「セクションを切替」する際に使用。
 * handleDB, handleDW, encodeLD などは全てこの層を通す。
 */
export declare function initCodegen(ctx: AsmContext, options?: {
    withDefaultSections?: boolean;
}): void;
export declare function emitBytes(ctx: AsmContext, data: number[], pos: SourcePos): void;
export declare function emitWord(ctx: AsmContext, value: number, pos: SourcePos): void;
export declare function emitFixup(ctx: AsmContext, symbol: string, size: 1 | 2 | 4 | undefined, requester: RequesterInfo, addend: number | undefined, pos: SourcePos): void;
export declare function emitSection(ctx: AsmContext, name: string, attrs?: {
    align?: number;
}): void;
export declare function emitGap(ctx: AsmContext, count: number, pos: SourcePos): void;
export declare function emitAlign(ctx: AsmContext, align: number, pos: SourcePos): void;
export declare function getLC(ctx: AsmContext): number;
export declare function setLC(ctx: AsmContext, newLC: number): void;
export declare function emitStorage(ctx: AsmContext, count: number, pos: SourcePos): void;
export declare function advanceLC(ctx: AsmContext, n: number): void;

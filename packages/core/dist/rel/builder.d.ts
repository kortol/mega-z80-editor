/** Structural data supplied by the assembler; core does not import assembler types. */
type AsmContext = {
    [key: string]: any;
    moduleName: string;
    sections: Map<any, any>;
    symbols: Map<string, any>;
    exportSymbols: Set<string>;
    externs: Set<string>;
    relocs: any[];
    unresolved: any[];
    texts: any[];
    output: any;
};
import { RelFile } from "./types";
import { RelModuleV2 } from "./types";
export declare class RelBuilder {
    private file;
    constructor(moduleName: string);
    addText(addr: number, bytes: number[]): void;
    addSymbol(name: string, addr: number, sectionId: number): void;
    addReloc(addr: number, sym: string, addend?: number): void;
    setEntry(addr: number): void;
    addUnresolved(addr: number, symbol: string): void;
    build(): RelFile;
}
export declare function buildRelFile(ctx: AsmContext): RelFile;
export declare function buildRelModuleV2(ctx: AsmContext): RelModuleV2;
export declare function emitRelV2(ctx: AsmContext, outPath: string): void;
export {};

export type SymEntry = {
    name: string;
    addr: number;
};
export declare function parseSymFile(symPath: string): SymEntry[];
export declare function buildAddrToNames(entries: SymEntry[]): Map<number, string[]>;

export type SourceMapEntry = {
    addr: number;
    size: number;
    file: string;
    line: number;
    column?: number;
    module?: string;
    section?: string;
};
export type SourceMapFile = {
    version: 1;
    kind: "as" | "link";
    module?: string;
    output?: string;
    entries: SourceMapEntry[];
};
export declare function normalizeMapPath(p: string): string;
export declare function readSourceMap(filePath: string): SourceMapFile | null;
export declare function writeSourceMap(filePath: string, map: SourceMapFile): void;
export declare function buildAddrToSource(entries: SourceMapEntry[]): Map<number, SourceMapEntry>;

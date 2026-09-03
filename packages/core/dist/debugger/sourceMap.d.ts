import { SourceMapEntry } from "../sourcemap/model";
export declare function parseDbgSourceMap(smapPath: string): SourceMapEntry[];
export declare function buildAddrToSourceEntry(entries: SourceMapEntry[]): Map<number, SourceMapEntry>;

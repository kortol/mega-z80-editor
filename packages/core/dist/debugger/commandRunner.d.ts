import { Z80DebugCore } from "./core";
import { SourceMapEntry } from "../sourcemap/model";
export declare function printHexDump(mem: Uint8Array, from: number, bytes: number): void;
export declare function printDisasm(mem: Uint8Array, from: number, count: number, addrToNames: Map<number, string[]>, addrToSource?: Map<number, SourceMapEntry>): void;
export declare function runCommandScript(core: Z80DebugCore, script: string, addrToNames: Map<number, string[]>, addrToSource?: Map<number, SourceMapEntry>): void;

export declare const SCC_RUNTIME_NAMES: readonly ["cpmcrt", "cpmlibc"];
export type SccRuntimeName = (typeof SCC_RUNTIME_NAMES)[number];
export declare function getBundledSccRuntime(name: SccRuntimeName): string;
export declare function writeBundledSccRuntime(name: SccRuntimeName, outputFile: string): void;

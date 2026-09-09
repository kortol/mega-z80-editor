import type { Logger } from "@mz80/core";
import type { CompileSccSourceResult } from "./scc/compilerAdapter";
/** Stable file-oriented entrypoint for the bundled TypeScript C subset compiler. */
export type CompileCFileOptions = {
    inputFile: string;
    tempDir: string;
    outputRelFile?: string;
    includeDirs?: string[];
    cppArgs?: string[];
    sccArgs?: string[];
    verbose?: boolean;
    sym?: boolean;
    smap?: boolean;
};
/** Stable source-oriented entrypoint; the source is staged under `tempDir`. */
export type CompileCSourceOptions = Omit<CompileCFileOptions, "inputFile"> & {
    source: string;
    fileName?: string;
};
export declare function compileCFile(logger: Logger, options: CompileCFileOptions): CompileSccSourceResult;
export declare function compileCSource(logger: Logger, options: CompileCSourceOptions): CompileSccSourceResult;

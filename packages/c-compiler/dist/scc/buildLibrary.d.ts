import { createArchive, Logger } from "@mz80/core";
import { CompilerAdapter, ExternalSccCompilerAdapterOptions } from "./compilerAdapter";
type ArchiveFiles = typeof createArchive;
export type BuildSccLibraryOptions = {
    outputFile: string;
    inputFiles: string[];
    includeDirs?: string[];
    cppArgs?: string[];
    sccArgs?: string[];
    dcppPath?: string;
    sccz80Path?: string;
    tempDir?: string;
    keepTemps?: boolean;
    verbose?: boolean;
    toolMode?: ExternalSccCompilerAdapterOptions["toolMode"];
};
type BuildDeps = {
    compilerAdapter?: CompilerAdapter;
    archiveFiles?: ArchiveFiles;
};
export declare function buildSccLibrary(logger: Logger, opts: BuildSccLibraryOptions, deps?: BuildDeps): {
    archivePath: string;
    relFiles: string[];
    tempDir: string;
};
export {};

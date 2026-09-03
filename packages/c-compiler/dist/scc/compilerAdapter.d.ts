import { assemble } from "@mz80/assembler";
import { Logger } from "@mz80/core";
import { RunTool, ToolMode } from "./externalToolchain";
type AssembleFile = typeof assemble;
export type CompileSccSourceResult = {
    inputFile: string;
    preprocessedFile: string;
    sccAsmFile: string;
    asmFile: string;
    relFile: string;
    stageDir: string;
};
export type CompilerAdapterCompileOptions = {
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
export interface CompilerAdapter {
    compileToRel(logger: Logger, opts: CompilerAdapterCompileOptions): CompileSccSourceResult;
}
export type ExternalSccCompilerAdapterOptions = {
    dcppPath?: string;
    sccz80Path?: string;
    toolMode?: ToolMode;
    runTool?: RunTool;
    assembleFile?: AssembleFile;
    tracePipeline?: boolean;
};
export declare class ExternalSccCompilerAdapter implements CompilerAdapter {
    private readonly dcppPath;
    private readonly sccz80Path;
    private readonly toolMode;
    private readonly runTool;
    private readonly assembleFile;
    private readonly tracePipeline;
    constructor(opts?: ExternalSccCompilerAdapterOptions);
    compileToRel(logger: Logger, opts: CompilerAdapterCompileOptions): CompileSccSourceResult;
}
export declare function compileSccSourceToRel(logger: Logger, opts: CompilerAdapterCompileOptions, adapter: CompilerAdapter): CompileSccSourceResult;
export {};

import { Logger } from "@mz80/core";
import { CompilerAdapter, CompilerAdapterCompileOptions, CompileSccSourceResult } from "./compilerAdapter";
export type TsSccCompilerAdapterOptions = {
    fixtureId?: string;
};
export declare class TsSccCompilerAdapter implements CompilerAdapter {
    private readonly fixtureId?;
    constructor(opts?: TsSccCompilerAdapterOptions);
    compileToRel(logger: Logger, opts: CompilerAdapterCompileOptions): CompileSccSourceResult;
}

import { Logger } from "@mz80/core";
import { CompilerAdapter, CompilerAdapterCompileOptions, CompileSccSourceResult } from "./compilerAdapter";
import { TsAbiProfile } from "./tsProgram";
export type TsSccCompilerAdapterOptions = {
    fixtureId?: string;
    abi?: TsAbiProfile;
};
export declare class TsSccCompilerAdapter implements CompilerAdapter {
    private readonly fixtureId?;
    private readonly abi;
    constructor(opts?: TsSccCompilerAdapterOptions);
    compileToRel(logger: Logger, opts: CompilerAdapterCompileOptions): CompileSccSourceResult;
    get abiProfile(): TsAbiProfile;
}

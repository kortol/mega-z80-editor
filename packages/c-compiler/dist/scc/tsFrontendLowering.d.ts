import { BoundProgram } from "./tsFrontendSemantic";
import { ProgramSpec, TsAbiProfile } from "./tsProgram";
export declare function lowerSourceProgram(program: BoundProgram, moduleName: string, sourceText: string, file?: string, abi?: TsAbiProfile): ProgramSpec;

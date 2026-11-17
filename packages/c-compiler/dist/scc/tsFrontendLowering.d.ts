import { BoundProgram } from "./tsFrontendSemantic";
import { ProgramSpec, TsAbiProfile } from "./tsProgram";
import { NumericFeature } from "./runtimeFeatures";
export declare function lowerSourceProgram(program: BoundProgram, moduleName: string, sourceText: string, file?: string, abi?: TsAbiProfile, features?: NumericFeature[]): ProgramSpec;

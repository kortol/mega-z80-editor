import { AsmContext, AsmOptions } from "./context";
import { Logger } from "@mz80/core";
export declare function writeSymFile(ctx: AsmContext, outputFile: string): void;
export declare function assemble(logger: Logger, inputFile: string, outputFile: string, options: AsmOptions): AsmContext;
export declare function runEmit(ctx: AsmContext): void;
export declare function finalizeOutput(ctx: AsmContext, outputFile: string, relVersion: number): AsmContext;

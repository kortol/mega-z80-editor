import { Logger } from "@mz80/core";
import { SccLibraryPresetName } from "./scc/libraryPresets";
export type SccLibCliOptions = {
    include?: string[];
    cppArg?: string[];
    sccArg?: string[];
    dcpp?: string;
    sccz80?: string;
    tempDir?: string;
    keepTemps?: boolean;
    verbose?: boolean;
    wsl?: boolean;
    preset?: SccLibraryPresetName;
};
export declare function buildSccLibraryArchive(logger: Logger, outputFile: string, inputFiles: string[], opts: SccLibCliOptions): void;

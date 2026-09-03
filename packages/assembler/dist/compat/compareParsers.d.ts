export type RunResult = {
    errors: string[];
    warnings: string[];
    outputs: OutputFiles;
    exception?: string;
};
export type OutputFiles = {
    rel?: string;
    lst?: string;
    sym?: string;
};
export type CompareOptions = {
    keepTemp?: boolean;
    relVersion?: 1 | 2;
};
export declare function runPegSource(name: string, src: string, opts?: CompareOptions, virtualFiles?: Map<string, string>): RunResult;
export declare function runPegFile(name: string, inputFile: string, opts?: CompareOptions): RunResult;

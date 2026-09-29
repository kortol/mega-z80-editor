export type TsPreprocessOptions = {
    includeDirs?: string[];
    defines?: Record<string, string>;
    bundledIncludeDirs?: string[];
};
export type TsPreprocessResult = {
    sourceText: string;
    runtimeVariadicNames: ReadonlySet<string>;
};
/** Token-aware preprocessing for user and bundled headers in the fixed C Subset. */
export declare function preprocessTsCSource(input: string, file: string, opts?: TsPreprocessOptions): TsPreprocessResult;

export type TsPreprocessOptions = {
    includeDirs?: string[];
    defines?: Record<string, string>;
    bundledIncludeDirs?: string[];
};
export type TsPreprocessResult = {
    sourceText: string;
    runtimeVariadicNames: ReadonlySet<string>;
};
/** Small, intentionally non-general preprocessor for bundled C runtime headers. */
export declare function preprocessTsCSource(input: string, file: string, opts?: TsPreprocessOptions): TsPreprocessResult;

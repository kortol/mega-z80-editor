export type TsDiagnostic = {
    message: string;
    file?: string;
    offset?: number;
    line: number;
    column: number;
};
export declare class TsFrontendError extends Error {
    readonly diagnostics: TsDiagnostic[];
    constructor(diagnostics: TsDiagnostic[]);
}
export declare function createDiagnostic(sourceText: string, message: string, opts?: {
    file?: string;
    offset?: number;
}): TsDiagnostic;
export declare function throwDiagnostic(sourceText: string, message: string, opts?: {
    file?: string;
    offset?: number;
}): never;
export declare function formatDiagnostic(diagnostic: TsDiagnostic): string;
export declare function formatDiagnostics(diagnostics: TsDiagnostic[]): string;

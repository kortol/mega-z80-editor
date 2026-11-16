export type RuntimeLibraryModule = {
    name: string;
    file: string;
    exports: string[];
    externs: string[];
};
/**
 * Source and archive contract for the platform-independent full runtime.
 * Keep this order stable: it is also the deterministic MZ80AR1 member order.
 */
export declare const FULL_RUNTIME_LIBRARY_MODULES: readonly RuntimeLibraryModule[];
/** Concatenates module sources for the legacy source-runtime path. */
export declare function readFullRuntimeSource(libraryRoot: string): string;

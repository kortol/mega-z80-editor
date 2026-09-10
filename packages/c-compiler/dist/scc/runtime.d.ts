export declare const SCC_RUNTIME_NAMES: readonly ["cpmcrt", "cpmlibc"];
export type SccRuntimeName = (typeof SCC_RUNTIME_NAMES)[number];
export declare const BUNDLED_RUNTIME_PLATFORMS: readonly ["cpm", "msx-bios", "raw"];
export type BundledRuntimePlatform = (typeof BUNDLED_RUNTIME_PLATFORMS)[number];
export declare const BUNDLED_RUNTIME_PROFILES: readonly ["lite", "full"];
export type BundledRuntimeProfile = (typeof BUNDLED_RUNTIME_PROFILES)[number];
export declare const MSX_RUNTIME_EXIT_MODES: readonly ["halt", "return"];
export type MsxRuntimeExitMode = (typeof MSX_RUNTIME_EXIT_MODES)[number];
/** Portable runtime selection used by project configuration and public APIs. */
export type BundledRuntimeSpec = {
    platform: BundledRuntimePlatform;
    profile: BundledRuntimeProfile;
    /** Required only by the MSX BIOS backend; omitted means halt. */
    exit?: MsxRuntimeExitMode;
};
export type RuntimeSelection = SccRuntimeName | BundledRuntimeSpec;
export declare function isSccRuntimeName(value: unknown): value is SccRuntimeName;
export declare function isBundledRuntimeSpec(value: unknown): value is BundledRuntimeSpec;
export declare function normalizeBundledRuntime(selection: RuntimeSelection): BundledRuntimeSpec;
export declare function runtimeId(selection: RuntimeSelection): string;
export declare function getBundledRuntimeDefines(selection: RuntimeSelection): Record<string, "1">;
export declare function getBundledRuntimeIncludeDir(): string;
export declare function getBundledSccRuntime(selection: RuntimeSelection): string;
export declare function writeBundledSccRuntime(selection: RuntimeSelection, outputFile: string): void;

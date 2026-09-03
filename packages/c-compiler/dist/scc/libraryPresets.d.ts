export declare const SCC_LIBRARY_PRESETS: {
    readonly "cpm-stdio": readonly ["CHARCLAS.C", "FGETS.C", "FPUTS.C", "GETCHAR.C", "GETS.C", "PUTCHAR.C", "PUTS.C", "STRLEN.C"];
};
export type SccLibraryPresetName = keyof typeof SCC_LIBRARY_PRESETS;
export declare function resolveSccLibraryPreset(name: SccLibraryPresetName): string[];

export const SCC_LIBRARY_PRESETS = {
  "cpm-stdio": [
    "CHARCLAS.C",
    "FGETS.C",
    "FPUTS.C",
    "GETCHAR.C",
    "GETS.C",
    "PUTCHAR.C",
    "PUTS.C",
    "STRLEN.C",
  ],
} as const;

export type SccLibraryPresetName = keyof typeof SCC_LIBRARY_PRESETS;

export function resolveSccLibraryPreset(name: SccLibraryPresetName): string[] {
  return [...SCC_LIBRARY_PRESETS[name]];
}

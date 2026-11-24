import { LinkMemoryLayout } from "@mz80/core";
import { RuntimeSelection } from "./runtime";
import { TsAbiProfile } from "./tsProgram";
export type RuntimeStartupOptions = {
    /** Zero-argument C entry, default main. */
    entry?: string;
    clearBss?: boolean;
    copyData?: boolean;
    setStack?: boolean;
    initHeap?: boolean;
    /** Primary-slot 16/32 KiB MSX cartridge header and BIOS slot setup. */
    msxCartridge?: boolean;
};
export declare function configuredStartupSource(runtime: RuntimeSelection, memory: LinkMemoryLayout, options?: RuntimeStartupOptions, abi?: TsAbiProfile): string;
export declare function buildConfiguredStartup(runtime: RuntimeSelection, memory: LinkMemoryLayout, options: RuntimeStartupOptions, abi: TsAbiProfile, directory: string): string;

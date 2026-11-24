export type MemoryAddress = number | string;
export type MemoryRange = {
    start: MemoryAddress;
    size: MemoryAddress;
};
/** Opt-in flat 16-bit layout. End addresses are exclusive. */
export type LinkMemoryLayout = {
    code: MemoryRange & {
        kind: "ram" | "rom";
    };
    ram: MemoryRange;
    stack: {
        top: MemoryAddress;
        size: MemoryAddress;
    };
    heap?: MemoryRange;
};
export type NormalizedMemoryLayout = {
    code: {
        start: number;
        size: number;
        kind: "ram" | "rom";
    };
    ram: {
        start: number;
        size: number;
    };
    stack: {
        start: number;
        top: number;
        size: number;
    };
    heap?: {
        start: number;
        size: number;
    };
};
export type MemoryLayoutReport = NormalizedMemoryLayout & {
    text: {
        start: number;
        size: number;
    };
    data: {
        start: number;
        size: number;
        loadAddress: number;
    };
    bss: {
        start: number;
        size: number;
    };
};
export declare function memoryAddress(value: unknown, label: string): number;
declare const overlaps: (left: {
    start: number;
    size: number;
}, right: {
    start: number;
    size: number;
}) => boolean;
export { overlaps as memoryRangesOverlap };
export declare function normalizeMemoryLayout(value: LinkMemoryLayout): NormalizedMemoryLayout;
export declare function validatePlacedMemory(layout: NormalizedMemoryLayout, sections: Array<{
    kind: string;
    start: number;
    size: number;
}>): void;

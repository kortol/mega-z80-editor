export interface RelSymbol {
    name: string;
    addr: number;
    section?: string;
    storage?: "ABS" | "REL" | "EXT";
    module?: string;
    defFile?: string;
    defLine?: number;
}
export interface RelText {
    addr: number;
    bytes: number[];
    section?: string;
}
export interface RelRef {
    addr: number;
    sym: string;
    section?: string;
}
export interface RelModule {
    name: string;
    symbols: RelSymbol[];
    texts: RelText[];
    refs: RelRef[];
    externs: string[];
    entry?: number;
    version?: number;
    sections?: RelSectionInfo[];
}
export type SegmentKind = "text" | "data" | "bss" | "custom";
export interface MemorySegment {
    bank: number;
    kind: SegmentKind;
    range: {
        min: number;
        max: number;
    };
    data?: Uint8Array;
}
export interface LinkResult {
    segments: MemorySegment[];
    entry?: number;
    symbols: Map<string, LinkedSymbol>;
    warnings?: string[];
    moduleSectionBases?: {
        moduleIndex: number;
        moduleName: string;
        section: string;
        base: number;
    }[];
    segmentDetails?: {
        kind: "text" | "data" | "bss" | "custom";
        sections: {
            name: string;
            base: number;
            size: number;
            align?: number;
            org?: number;
        }[];
    }[];
}
export interface LinkedSymbol {
    bank: number;
    addr: number;
    module?: string;
    section?: string;
    definedAt?: string;
}
export interface ModuleSection {
    id: number;
    kind: "TEXT" | "DATA" | "BSS" | "CUSTOM" | "ASEG";
    name: string;
    align: number;
    flags: number;
    size: number;
    base?: number;
    data?: Uint8Array;
}
export interface RelSectionInfo {
    id: number;
    name: string;
    kind?: "TEXT" | "DATA" | "BSS" | "CUSTOM" | "ASEG";
    align?: number;
    size?: number;
    org?: number;
}
export interface MultiSectionModule {
    sections: ModuleSection[];
    symbols: {
        name: string;
        storage: "ABS" | "REL" | "EXT";
        sectionId: number | null;
        value: number;
    }[];
    fixups: {
        sectionId: number;
        offset: number;
        width: number;
        signed: boolean;
        pcrel: boolean;
        symIndex: number;
        addend: number;
    }[];
    dataBlob?: Uint8Array;
    entrySymIndex?: number;
}
export interface MemorySegmentRule {
    match: {
        kind?: "TEXT" | "DATA" | "BSS" | "CUSTOM";
        name?: string | RegExp;
    };
    org?: number;
    after?: string;
    align?: number;
    order?: number;
    flags?: {
        ro?: boolean;
        rw?: boolean;
        exec?: boolean;
        load?: boolean;
        alloc?: boolean;
    };
    note?: string;
    source?: "cli" | "script" | "default";
}

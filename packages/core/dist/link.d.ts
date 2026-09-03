export declare function link(inputFiles: string[], outputFile: string, opts: {
    verbose?: boolean;
    map?: boolean;
    sym?: boolean;
    smap?: boolean;
    log?: boolean;
    com?: boolean;
    binFrom?: string | number;
    binTo?: string | number;
    orgText?: string | number;
    orgData?: string | number;
    orgBss?: string | number;
    orgCustom?: string | number;
    fullpath?: "off" | "rel" | "on" | boolean | string;
}): void;

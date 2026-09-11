import { Logger } from "@mz80/core";
import { RuntimeSelection, ToolMode } from "@mz80/c-compiler";
export type Mz80AsOptions = {
    relVersion?: number | string;
    sym?: boolean;
    lst?: boolean;
    smap?: boolean;
    symLen?: number | string;
    includePaths?: string[];
    sjasmCompat?: boolean;
};
export type Mz80LinkOptions = {
    com?: boolean;
    map?: boolean;
    sym?: boolean;
    smap?: boolean;
    log?: boolean;
    fullpath?: "off" | "rel" | "on";
    binFrom?: string | number;
    binTo?: string | number;
    orgText?: string | number;
    orgData?: string | number;
    orgBss?: string | number;
    orgCustom?: string | number;
};
export type Mz80CleanOptions = {
    files?: string[];
};
export type Mz80CcOptions = {
    runtime?: RuntimeSelection;
    libraries?: string[];
    includeDirs?: string[];
    cppArgs?: string[];
    sccArgs?: string[];
    dcpp?: string;
    sccz80?: string;
    toolMode?: ToolMode;
    tempDir?: string;
    keepTemps?: boolean;
    tracePipeline?: boolean;
};
export type BuildProjectOverrides = {
    runtime?: RuntimeSelection;
    libraries?: string[];
    cc?: Mz80CcOptions;
};
export type Mz80ProjectTargetModule = string | {
    source: string;
    object?: string;
};
export type Mz80ProjectTarget = {
    output: string;
    modules: Mz80ProjectTargetModule[];
    runtime?: RuntimeSelection;
    runtimeObject?: string;
    libraries?: string[];
    cc?: Mz80CcOptions;
    as?: Mz80AsOptions;
    link?: Mz80LinkOptions;
};
export type Mz80Config = {
    project?: {
        defaultTarget?: string;
        clean?: Mz80CleanOptions;
    };
    as?: Mz80AsOptions;
    link?: Mz80LinkOptions;
    cc?: Mz80CcOptions;
    targets?: Record<string, Mz80ProjectTarget>;
};
export type ResolvedProjectModule = {
    source: string;
    object: string;
    kind: "asm" | "c";
};
export type ResolvedProjectTarget = {
    name: string;
    output: string;
    modules: ResolvedProjectModule[];
    runtime?: {
        name: RuntimeSelection;
        object: string;
        source?: string;
        asm?: string;
        libraries: string[];
        requiredSymbols?: string[];
    };
    libraries: string[];
    cc?: Mz80CcOptions;
    as?: Mz80AsOptions;
    link?: Mz80LinkOptions;
};
export declare function loadProjectConfig(configPath: string, logger?: Logger): Mz80Config;
export declare function listProjectTargets(cfg: Mz80Config): string[];
export declare function resolveProjectTarget(configPath: string, cfg: Mz80Config, requestedTarget?: string): ResolvedProjectTarget;
export declare function buildProjectTarget(configPath: string, cfg: Mz80Config, requestedTarget: string | undefined, logger: Logger, overrides?: BuildProjectOverrides): ResolvedProjectTarget;
export declare function cleanProject(configPath: string, cfg: Mz80Config): string[];

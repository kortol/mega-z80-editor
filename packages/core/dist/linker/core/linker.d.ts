import { RelModule, LinkResult } from "./types";
import { LinkMemoryLayout } from "../memoryLayout";
export declare function linkModules(mods: RelModule[]): LinkResult;
export declare function linkModulesV2(mods: RelModule[], opts?: {
    orgText?: number;
    orgData?: number;
    orgBss?: number;
    orgCustom?: number;
    memory?: LinkMemoryLayout;
}): LinkResult;

import { RuntimeSelection } from "./runtime";
export type BundledRuntimeArtifacts = {
    crtRelPath: string;
    libraryPaths: string[];
    requiredSymbols?: string[];
};
/** Returns installed, prebuilt link inputs for a structured runtime selection. */
export declare function getBundledRuntimeArtifacts(selection: RuntimeSelection): BundledRuntimeArtifacts;
/** Invoked after TypeScript compilation to make deterministic distributable runtime artifacts. */
export declare function buildBundledRuntimeArtifacts(): void;

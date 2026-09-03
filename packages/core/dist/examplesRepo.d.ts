export declare const EXAMPLES_DIR_ENV = "MZ80_EXAMPLES_DIR";
export declare const EXAMPLES_REPO_NAME = "mega-z80-examples";
export declare function getExamplesRepoCandidates(repoRoot: string): string[];
export declare function resolveExamplesRepoDir(repoRoot: string): string | null;
export declare function resolveExamplesPath(repoRoot: string, ...segments: string[]): string | null;

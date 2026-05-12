import fs from "fs";
import path from "path";

export const EXAMPLES_DIR_ENV = "MZ80_EXAMPLES_DIR";
export const EXAMPLES_REPO_NAME = "mega-z80-examples";

export function getExamplesRepoCandidates(repoRoot: string): string[] {
  const envDir = process.env[EXAMPLES_DIR_ENV]?.trim();
  const dirs = [
    envDir ? path.resolve(envDir) : null,
    path.resolve(repoRoot, "..", EXAMPLES_REPO_NAME),
    path.resolve(repoRoot, "examples"),
  ].filter((value): value is string => !!value);

  return [...new Set(dirs)];
}

export function resolveExamplesRepoDir(repoRoot: string): string | null {
  return getExamplesRepoCandidates(repoRoot).find((dir) => fs.existsSync(dir)) ?? null;
}

export function resolveExamplesPath(repoRoot: string, ...segments: string[]): string | null {
  for (const dir of getExamplesRepoCandidates(repoRoot)) {
    const full = path.join(dir, ...segments);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

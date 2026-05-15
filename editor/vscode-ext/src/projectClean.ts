import * as fs from "node:fs";
import * as path from "node:path";
import { synthesizeProjectClean } from "./cleanPatterns";
import { Mz80ProjectFile } from "./projectConfig";

export type CleanProjectResult = {
  deleted: string[];
  missing: string[];
  skippedOutsideRoot: string[];
  skippedDirectories: string[];
};

export function cleanProjectOutputs(projectRoot: string, project: Mz80ProjectFile): CleanProjectResult {
  const clean = project.project?.clean ?? synthesizeProjectClean(project);
  const result: CleanProjectResult = {
    deleted: [],
    missing: [],
    skippedOutsideRoot: [],
    skippedDirectories: [],
  };

  for (const relPath of clean?.files ?? []) {
    const resolved = path.resolve(projectRoot, relPath);
    if (!isWithinRoot(projectRoot, resolved)) {
      result.skippedOutsideRoot.push(resolved);
      continue;
    }
    if (!fs.existsSync(resolved)) {
      result.missing.push(resolved);
      continue;
    }
    const stat = fs.lstatSync(resolved);
    if (stat.isDirectory()) {
      result.skippedDirectories.push(resolved);
      continue;
    }
    fs.unlinkSync(resolved);
    result.deleted.push(resolved);
  }

  return result;
}

function isWithinRoot(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  if (path.resolve(root) === path.resolve(candidate)) {
    return true;
  }
  return rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel);
}

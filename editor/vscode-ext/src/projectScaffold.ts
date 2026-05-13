import * as fs from "node:fs";
import * as path from "node:path";
import { Mz80ProjectFile } from "./projectConfig";

export function generateProjectFromFolders(workspaceRoot: string, existing?: Mz80ProjectFile): Mz80ProjectFile {
  const srcDir = path.join(workspaceRoot, "src");
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    throw new Error("Expected a 'src' directory in the workspace root.");
  }

  const asmFiles = fs.readdirSync(srcDir)
    .filter((name) => /\.asm$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  if (asmFiles.length === 0) {
    throw new Error("No .asm files were found under src/.");
  }

  const workspaceName = path.basename(workspaceRoot);
  const targetName = sanitizeTargetName(workspaceName);
  const outputExt = "com";

  return {
    ...(existing ?? {}),
    version: 1,
    project: {
      ...(existing?.project ?? {}),
      defaultTarget: targetName,
    },
    targets: {
      ...(existing?.targets ?? {}),
      [targetName]: {
        output: `build/${targetName}.${outputExt}`,
        modules: asmFiles.map((name) => ({
          source: `src/${name}`,
          object: `build/${name.replace(/\.asm$/i, ".rel")}`,
        })),
        as: {
          sym: true,
          lst: true,
          smap: true,
        },
        link: {
          com: true,
          map: true,
          sym: true,
          smap: true,
          log: true,
        },
        debug: {
          cpm: true,
          cpmInteractive: true,
        },
      },
    },
  };
}

function sanitizeTargetName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "default";
}

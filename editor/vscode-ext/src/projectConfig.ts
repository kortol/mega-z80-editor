import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "yaml";

export type Mz80AsOptions = {
  relVersion?: number | string;
  sym?: boolean;
  lst?: boolean;
  smap?: boolean;
  sjasmCompat?: boolean;
  symLen?: number | string;
  includePaths?: string[];
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

export type Mz80DebugTargetOptions = {
  cpm?: boolean;
  cpmInteractive?: boolean;
  base?: string;
  rpcListen?: string;
};

export type Mz80CleanOptions = {
  files?: string[];
};

export type Mz80TargetModule = string | {
  source: string;
  object?: string;
};

export type Mz80TargetConfig = {
  output: string;
  modules: Mz80TargetModule[];
  as?: Mz80AsOptions;
  link?: Mz80LinkOptions;
  debug?: Mz80DebugTargetOptions;
};

export type Mz80ProjectFile = {
  version?: number;
  project?: {
    defaultTarget?: string;
    clean?: Mz80CleanOptions;
  };
  as?: Mz80AsOptions;
  link?: Mz80LinkOptions;
  targets?: Record<string, Mz80TargetConfig>;
  [key: string]: unknown;
};

export type ResolvedTargetModule = {
  source: string;
  object: string;
};

export type ResolvedTargetConfig = Omit<Mz80TargetConfig, "modules"> & {
  name: string;
  modules: ResolvedTargetModule[];
};

export const PROJECT_CONFIG_FILE = "mz80.yaml";

export function getProjectConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, PROJECT_CONFIG_FILE);
}

export function loadProjectFile(workspaceRoot: string): Mz80ProjectFile | undefined {
  const configPath = getProjectConfigPath(workspaceRoot);
  if (!fs.existsSync(configPath)) return undefined;
  const content = fs.readFileSync(configPath, "utf8");
  const parsed = yaml.parse(content);
  if (!parsed || typeof parsed !== "object") return undefined;
  return parsed as Mz80ProjectFile;
}

export function saveProjectFile(workspaceRoot: string, project: Mz80ProjectFile): void {
  const configPath = getProjectConfigPath(workspaceRoot);
  const text = yaml.stringify(project, {
    defaultKeyType: "PLAIN",
    lineWidth: 0,
  });
  fs.writeFileSync(configPath, text, "utf8");
}

export function listTargetNames(project: Mz80ProjectFile | undefined): string[] {
  return project?.targets ? Object.keys(project.targets) : [];
}

export function resolveTargetName(project: Mz80ProjectFile | undefined, preferred?: string): string | undefined {
  const targetNames = listTargetNames(project);
  if (preferred && project?.targets?.[preferred]) return preferred;
  if (project?.project?.defaultTarget && project.targets?.[project.project.defaultTarget]) {
    return project.project.defaultTarget;
  }
  if (targetNames.length === 1) return targetNames[0];
  return undefined;
}

function deriveObjectPath(target: string, modulePath: string): string {
  const outDir = path.dirname(target);
  const base = path.basename(modulePath).replace(/\.[^.]+$/, ".rel");
  return path.join(outDir, base);
}

export function resolveTarget(
  workspaceRoot: string,
  project: Mz80ProjectFile,
  targetName: string,
): ResolvedTargetConfig | undefined {
  const raw = project.targets?.[targetName];
  if (!raw) return undefined;
  const modules = raw.modules.map((entry) => {
    if (typeof entry === "string") {
      return {
        source: path.resolve(workspaceRoot, entry),
        object: path.resolve(workspaceRoot, deriveObjectPath(raw.output, entry)),
      };
    }
    return {
      source: path.resolve(workspaceRoot, entry.source),
      object: path.resolve(
        workspaceRoot,
        entry.object && entry.object.trim().length > 0
          ? entry.object
          : deriveObjectPath(raw.output, entry.source),
      ),
    };
  });

  return {
    ...raw,
    name: targetName,
    output: path.resolve(workspaceRoot, raw.output),
    modules,
  };
}

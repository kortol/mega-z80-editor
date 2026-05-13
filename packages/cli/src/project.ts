import fs from "fs";
import path from "path";
import yaml from "yaml";
import { Logger } from "./logger";
import { assemble } from "./cli/mz80-as";
import { link } from "./cli/mz80-link";

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

export type Mz80ProjectTargetModule = string | {
  source: string;
  object?: string;
};

export type Mz80ProjectTarget = {
  output: string;
  modules: Mz80ProjectTargetModule[];
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
  targets?: Record<string, Mz80ProjectTarget>;
};

export type ResolvedProjectModule = {
  source: string;
  object: string;
};

export type ResolvedProjectTarget = {
  name: string;
  output: string;
  modules: ResolvedProjectModule[];
  as?: Mz80AsOptions;
  link?: Mz80LinkOptions;
};

export function loadProjectConfig(configPath: string, logger?: Logger): Mz80Config {
  try {
    if (!fs.existsSync(configPath)) return {};
    const content = fs.readFileSync(configPath, "utf-8");
    return (yaml.parse(content) ?? {}) as Mz80Config;
  } catch (err: any) {
    logger?.warn?.(`Failed to load config: ${err?.message ?? err}`);
    return {};
  }
}

export function listProjectTargets(cfg: Mz80Config): string[] {
  return cfg.targets ? Object.keys(cfg.targets) : [];
}

export function resolveProjectTarget(
  configPath: string,
  cfg: Mz80Config,
  requestedTarget?: string,
): ResolvedProjectTarget {
  const configDir = path.dirname(configPath);
  const targetNames = listProjectTargets(cfg);
  if (targetNames.length === 0) {
    throw new Error("No targets defined in mz80.yaml");
  }

  const targetName = requestedTarget
    ?? cfg.project?.defaultTarget
    ?? (targetNames.length === 1 ? targetNames[0] : undefined);

  if (!targetName) {
    throw new Error(`Multiple targets found. Specify one explicitly: ${targetNames.join(", ")}`);
  }

  const raw = cfg.targets?.[targetName];
  if (!raw) {
    throw new Error(`Unknown target: ${targetName}`);
  }

  const modules = raw.modules.map((entry) => {
    if (typeof entry === "string") {
      return {
        source: path.resolve(configDir, entry),
        object: path.resolve(configDir, deriveObjectPath(raw.output, entry)),
      };
    }
    return {
      source: path.resolve(configDir, entry.source),
      object: path.resolve(
        configDir,
        entry.object && entry.object.trim().length > 0
          ? entry.object
          : deriveObjectPath(raw.output, entry.source),
      ),
    };
  });

  return {
    name: targetName,
    output: path.resolve(configDir, raw.output),
    modules,
    as: mergeAsOptions(cfg.as, raw.as),
    link: mergeLinkOptions(cfg.link, raw.link),
  };
}

export function buildProjectTarget(
  configPath: string,
  cfg: Mz80Config,
  requestedTarget: string | undefined,
  logger: Logger,
): ResolvedProjectTarget {
  const target = resolveProjectTarget(configPath, cfg, requestedTarget);
  for (const mod of target.modules) {
    fs.mkdirSync(path.dirname(mod.object), { recursive: true });
    assemble(logger, mod.source, mod.object, {
      ...(target.as ?? {}),
      relVersion: normalizeRelVersion(target.as?.relVersion),
      symLen: normalizeSymLen(target.as?.symLen),
      includePaths: (target.as?.includePaths ?? []).map((p) => path.resolve(path.dirname(configPath), p)),
      verbose: false,
    });
  }

  fs.mkdirSync(path.dirname(target.output), { recursive: true });
  link(target.modules.map((mod) => mod.object), target.output, target.link ?? {});
  return target;
}

export function cleanProject(configPath: string, cfg: Mz80Config): string[] {
  const configDir = path.dirname(configPath);
  const patterns = cfg.project?.clean?.files ?? [];
  if (patterns.length === 0) {
    throw new Error("No clean patterns defined in mz80.yaml");
  }

  const removed = new Set<string>();
  for (const pattern of patterns) {
    if (!isSafeCleanPattern(pattern)) {
      throw new Error(`Unsafe clean pattern rejected: ${pattern}`);
    }
    for (const match of expandPattern(configDir, pattern)) {
      if (!fs.existsSync(match)) continue;
      const stat = fs.statSync(match);
      if (!stat.isFile()) continue;
      fs.unlinkSync(match);
      removed.add(path.resolve(match));
    }
  }
  return [...removed].sort((a, b) => a.localeCompare(b));
}

function deriveObjectPath(targetOutput: string, sourcePath: string): string {
  const outDir = path.dirname(targetOutput);
  const base = path.basename(sourcePath).replace(/\.[^.]+$/, ".rel");
  return path.join(outDir, base);
}

function mergeAsOptions(base?: Mz80AsOptions, override?: Mz80AsOptions): Mz80AsOptions | undefined {
  if (!base && !override) return undefined;
  return {
    ...(base ?? {}),
    ...(override ?? {}),
    includePaths: override?.includePaths ?? base?.includePaths,
  };
}

function mergeLinkOptions(base?: Mz80LinkOptions, override?: Mz80LinkOptions): Mz80LinkOptions | undefined {
  if (!base && !override) return undefined;
  return {
    ...(base ?? {}),
    ...(override ?? {}),
  };
}

function normalizeRelVersion(value?: number | string): 1 | 2 | undefined {
  if (value === undefined) return undefined;
  return String(value) === "2" ? 2 : 1;
}

function normalizeSymLen(value?: number | string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function expandPattern(rootDir: string, pattern: string): string[] {
  const normalized = pattern.replace(/\\/g, "/");
  if (!/[*?]/.test(normalized)) {
    return [path.resolve(rootDir, normalized)];
  }

  const regex = wildcardToRegExp(normalized);
  const results: string[] = [];
  walkFiles(rootDir, rootDir, regex, results);
  return results;
}

function walkFiles(baseDir: string, currentDir: string, regex: RegExp, out: string[]): void {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const abs = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(baseDir, abs, regex, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = path.relative(baseDir, abs).replace(/\\/g, "/");
    if (regex.test(rel) || regex.test(entry.name)) {
      out.push(abs);
    }
  }
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexText = `^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`;
  return new RegExp(regexText, "i");
}

function isSafeCleanPattern(pattern: string): boolean {
  const normalized = String(pattern ?? "").trim().replace(/\\/g, "/");
  if (!normalized) return false;
  if (path.isAbsolute(normalized)) return false;
  if (normalized.includes("..")) return false;
  if (normalized.includes("**")) return false;

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  if (segments.some((segment) => /^[*?]+$/.test(segment))) return false;

  const basename = segments[segments.length - 1];
  if (/^[*?]+$/.test(basename)) return false;
  if (!/[*?]/.test(basename)) return true;

  return /[A-Za-z0-9_.-]/.test(basename.replace(/[*?]/g, ""));
}

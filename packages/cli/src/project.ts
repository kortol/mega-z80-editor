import fs from "fs";
import path from "path";
import yaml from "yaml";
import { Logger } from "./logger";
import { assemble } from "./cli/mz80-as";
import { link } from "./cli/mz80-link";
import { compileSccSourceToRel } from "./scc/compileProgram";
import { ExternalSccCompilerAdapter } from "./scc/compilerAdapter";
import { getBundledSccRuntime, SccRuntimeName } from "./scc/runtime";
import { safeRmDir, ToolMode } from "./scc/externalToolchain";
import { translateSccAsm } from "./scc/translateAsm";

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
  runtime?: SccRuntimeName;
  libraries?: string[];
  includeDirs?: string[];
  cppArgs?: string[];
  sccArgs?: string[];
  dcpp?: string;
  sccz80?: string;
  toolMode?: ToolMode;
  tempDir?: string;
  keepTemps?: boolean;
};

export type Mz80ProjectTargetModule = string | {
  source: string;
  object?: string;
};

export type Mz80ProjectTarget = {
  output: string;
  modules: Mz80ProjectTargetModule[];
  runtime?: SccRuntimeName;
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
    name: SccRuntimeName;
    source: string;
    asm: string;
    object: string;
  };
  libraries: string[];
  cc?: Mz80CcOptions;
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
        kind: resolveModuleKind(entry),
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
      kind: resolveModuleKind(entry.source),
    };
  });

  const mergedCc = mergeCcOptions(
    {
      runtime: raw.runtime,
      libraries: raw.libraries,
    },
    mergeCcOptions(cfg.cc, raw.cc),
  );

  const runtimeName = mergedCc?.runtime ?? raw.runtime;

  return {
    name: targetName,
    output: path.resolve(configDir, raw.output),
    modules,
    runtime: runtimeName
      ? resolveRuntimePaths(
        configDir,
        raw.output,
        runtimeName,
        raw.runtimeObject,
      )
      : undefined,
    libraries: (mergedCc?.libraries ?? raw.libraries ?? []).map((entry) => path.resolve(configDir, entry)),
    cc: mergedCc
      ? {
        ...mergedCc,
        tempDir: mergedCc.tempDir ? path.resolve(configDir, mergedCc.tempDir) : undefined,
        includeDirs: (mergedCc.includeDirs ?? []).map((entry) => path.resolve(configDir, entry)),
      }
      : undefined,
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
  const tempDir = target.cc?.tempDir
    ? path.resolve(target.cc.tempDir)
    : path.join(path.dirname(target.output), `.mz80-scc-${target.name}`);
  const compilerAdapter = new ExternalSccCompilerAdapter({
    dcppPath: target.cc?.dcpp,
    sccz80Path: target.cc?.sccz80,
    toolMode: target.cc?.toolMode ?? "host",
  });
  if (target.runtime) {
    fs.mkdirSync(path.dirname(target.runtime.source), { recursive: true });
    fs.writeFileSync(target.runtime.source, getBundledSccRuntime(target.runtime.name), "utf8");
    fs.writeFileSync(
      target.runtime.asm,
      translateSccAsm(fs.readFileSync(target.runtime.source, "utf8"), { moduleName: target.runtime.name }),
      "utf8",
    );
    assemble(logger, target.runtime.asm, target.runtime.object, {
      ...(target.as ?? {}),
      relVersion: normalizeRelVersion(target.as?.relVersion),
      symLen: normalizeSymLen(target.as?.symLen),
      includePaths: (target.as?.includePaths ?? []).map((p) => path.resolve(path.dirname(configPath), p)),
      verbose: false,
    });
  }
  try {
    for (const mod of target.modules) {
      fs.mkdirSync(path.dirname(mod.object), { recursive: true });
      if (mod.kind === "c") {
        compileSccSourceToRel(logger, {
          inputFile: mod.source,
          outputRelFile: mod.object,
          includeDirs: target.cc?.includeDirs ?? [],
          cppArgs: target.cc?.cppArgs ?? [],
          sccArgs: target.cc?.sccArgs ?? [],
          tempDir,
          verbose: false,
          sym: !!target.link?.sym,
          smap: !!target.link?.smap,
        }, compilerAdapter);
        continue;
      }
      assemble(logger, mod.source, mod.object, {
        ...(target.as ?? {}),
        relVersion: normalizeRelVersion(target.as?.relVersion),
        symLen: normalizeSymLen(target.as?.symLen),
        includePaths: (target.as?.includePaths ?? []).map((p) => path.resolve(path.dirname(configPath), p)),
        verbose: false,
      });
    }

    fs.mkdirSync(path.dirname(target.output), { recursive: true });
    link([
      ...(target.runtime ? [target.runtime.object] : []),
      ...target.modules.map((mod) => mod.object),
      ...target.libraries,
    ], target.output, target.link ?? {});
    return target;
  } finally {
    if (!target.cc?.keepTemps && !target.cc?.tempDir) {
      safeRmDir(tempDir);
    }
  }
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

function resolveRuntimePaths(
  configDir: string,
  targetOutput: string,
  runtimeName: SccRuntimeName,
  runtimeObject?: string,
): ResolvedProjectTarget["runtime"] {
  const objectPath = path.resolve(
    configDir,
    runtimeObject && runtimeObject.trim().length > 0
      ? runtimeObject
      : path.join(path.dirname(targetOutput), `${runtimeName}.rel`),
  );
  const basePath = objectPath.replace(/\.rel$/i, "");
  return {
    name: runtimeName,
    source: `${basePath}.scc.asm`,
    asm: `${basePath}.asm`,
    object: objectPath,
  };
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

function mergeCcOptions(base?: Mz80CcOptions, override?: Mz80CcOptions): Mz80CcOptions | undefined {
  if (!base && !override) return undefined;
  return {
    ...(base ?? {}),
    ...(override ?? {}),
    libraries: override?.libraries ?? base?.libraries,
    includeDirs: override?.includeDirs ?? base?.includeDirs,
    cppArgs: override?.cppArgs ?? base?.cppArgs,
    sccArgs: override?.sccArgs ?? base?.sccArgs,
  };
}

function normalizeRelVersion(value?: number | string): 1 | 2 | undefined {
  if (value === undefined) return 2;
  return String(value) === "2" ? 2 : 1;
}

function normalizeSymLen(value?: number | string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function resolveModuleKind(sourcePath: string): "asm" | "c" {
  return /\.c$/i.test(sourcePath) ? "c" : "asm";
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

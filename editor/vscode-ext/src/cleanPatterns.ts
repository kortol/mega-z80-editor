import { Mz80AsOptions, Mz80CleanOptions, Mz80LinkOptions, Mz80ProjectFile, Mz80TargetConfig, Mz80TargetModule } from "./projectConfig";

export function synthesizeProjectClean(project: Mz80ProjectFile): Mz80CleanOptions | undefined {
  const files = new Set<string>();

  for (const target of Object.values(project.targets ?? {})) {
    const asOptions = mergeAsOptions(project.as, target.as);
    const linkOptions = mergeLinkOptions(project.link, target.link);

    for (const moduleEntry of target.modules) {
      const objectPath = toPosixPath(resolveModuleObjectPath(target, moduleEntry));
      files.add(objectPath);
      if (asOptions?.lst) files.add(replaceExtension(objectPath, ".lst"));
      if (asOptions?.sym) files.add(replaceExtension(objectPath, ".sym"));
      if (asOptions?.smap) files.add(replaceExtension(objectPath, ".smap"));
    }

    const outputPath = toPosixPath(target.output);
    files.add(outputPath);
    files.add(`${outputPath}.dmp`);
    if (linkOptions?.map) files.add(replaceExtension(outputPath, ".map"));
    if (linkOptions?.sym) files.add(replaceExtension(outputPath, ".sym"));
    if (linkOptions?.smap) files.add(replaceExtension(outputPath, ".smap"));
    if (linkOptions?.log) files.add(replaceExtension(outputPath, ".log"));
  }

  return files.size > 0 ? { files: [...files].sort((a, b) => a.localeCompare(b)) } : undefined;
}

function resolveModuleObjectPath(target: Mz80TargetConfig, moduleEntry: Mz80TargetModule): string {
  if (typeof moduleEntry === "string") {
    return deriveObjectPath(target.output, moduleEntry);
  }
  if (typeof moduleEntry.object === "string" && moduleEntry.object.trim().length > 0) {
    return moduleEntry.object;
  }
  return deriveObjectPath(target.output, moduleEntry.source);
}

function deriveObjectPath(targetOutput: string, sourcePath: string): string {
  const outDir = dirname(targetOutput);
  const base = basename(sourcePath).replace(/\.[^.]+$/, ".rel");
  return outDir ? `${outDir}/${base}` : base;
}

function replaceExtension(filePath: string, nextExt: string): string {
  const slash = filePath.lastIndexOf("/");
  const dot = filePath.lastIndexOf(".");
  if (dot > slash) {
    return `${filePath.slice(0, dot)}${nextExt}`;
  }
  return `${filePath}${nextExt}`;
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

function dirname(filePath: string): string {
  const normalized = toPosixPath(filePath);
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(0, idx) : "";
}

function basename(filePath: string): string {
  const normalized = toPosixPath(filePath);
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

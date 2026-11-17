import fs from "node:fs";
import path from "node:path";
import { readFullRuntimeSource } from "./runtimeLibrary";
import { NumericFeature, NUMERIC_C_MEMBERS, normalizeNumericFeatures, requireNumericFeatures } from "./runtimeFeatures";

export const SCC_RUNTIME_NAMES = ["cpmcrt", "cpmlibc"] as const;
export type SccRuntimeName = (typeof SCC_RUNTIME_NAMES)[number];

export const BUNDLED_RUNTIME_PLATFORMS = ["cpm", "msx-bios", "raw"] as const;
export type BundledRuntimePlatform = (typeof BUNDLED_RUNTIME_PLATFORMS)[number];
export const BUNDLED_RUNTIME_PROFILES = ["lite", "full"] as const;
export type BundledRuntimeProfile = (typeof BUNDLED_RUNTIME_PROFILES)[number];
export const MSX_RUNTIME_EXIT_MODES = ["halt", "return"] as const;
export type MsxRuntimeExitMode = (typeof MSX_RUNTIME_EXIT_MODES)[number];

/** Portable runtime selection used by project configuration and public APIs. */
export type BundledRuntimeSpec = {
  features?: NumericFeature[];
  platform: BundledRuntimePlatform;
  profile: BundledRuntimeProfile;
  /** Required only by the MSX BIOS backend; omitted means halt. */
  exit?: MsxRuntimeExitMode;
};

export type RuntimeSelection = SccRuntimeName | BundledRuntimeSpec;

export function isSccRuntimeName(value: unknown): value is SccRuntimeName {
  return typeof value === "string" && (SCC_RUNTIME_NAMES as readonly string[]).includes(value);
}

export function isBundledRuntimeSpec(value: unknown): value is BundledRuntimeSpec {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BundledRuntimeSpec>;
  try { normalizeNumericFeatures(candidate.features); } catch { return false; }
  return (BUNDLED_RUNTIME_PLATFORMS as readonly string[]).includes(candidate.platform ?? "") &&
    (BUNDLED_RUNTIME_PROFILES as readonly string[]).includes(candidate.profile ?? "") &&
    (candidate.exit === undefined || (MSX_RUNTIME_EXIT_MODES as readonly string[]).includes(candidate.exit));
}

export function normalizeBundledRuntime(selection: RuntimeSelection): BundledRuntimeSpec {
  if (typeof selection !== "string") {
    if (selection.platform !== "msx-bios" && selection.exit !== undefined) {
      throw new Error(`Runtime exit mode is valid only for msx-bios, got ${selection.platform}.`);
    }
    const features = normalizeNumericFeatures(selection.features);
    const normalized = { ...selection, ...(selection.features !== undefined ? { features } : {}) };
    return selection.platform === "msx-bios" ? { ...normalized, exit: selection.exit ?? "halt" } : normalized;
  }
  if (selection === "cpmcrt") return { platform: "cpm", profile: "lite" };
  // cpmlibc remains a link-compatible legacy runtime rather than a full profile.
  return { platform: "cpm", profile: "lite" };
}

export function runtimeId(selection: RuntimeSelection): string {
  if (typeof selection === "string") return selection;
  const normalized = normalizeBundledRuntime(selection);
  return normalized.platform === "msx-bios"
    ? `${normalized.platform}-${normalized.profile}-${normalized.exit}`
    : `${normalized.platform}-${normalized.profile}`;
}

export function getBundledRuntimeDefines(selection: RuntimeSelection): Record<string, "1"> {
  const spec = normalizeBundledRuntime(selection);
  const defines: Record<string, "1"> = {
    [`MZ80_PLATFORM_${spec.platform.replace(/-/g, "_").toUpperCase()}`]: "1",
    [`MZ80_RUNTIME_${spec.profile.toUpperCase()}`]: "1",
  };
  if (spec.platform === "msx-bios") {
    defines[`MZ80_MSX_EXIT_${(spec.exit ?? "halt").toUpperCase()}`] = "1";
  }
  for (const feature of requireNumericFeatures(spec.features)) defines[`MZ80_FEATURE_${feature.toUpperCase()}`] = "1";
  return defines;
}

export function getBundledRuntimeIncludeDir(): string {
  return path.join(__dirname, "runtime", "include");
}

export function getBundledRuntimeIncludeDirs(selection: RuntimeSelection): string[] {
  const features = requireNumericFeatures(normalizeBundledRuntime(selection).features);
  const root = fs.existsSync(path.join(__dirname, "runtime", "numeric", "available.json"))
    ? path.join(__dirname, "runtime") : path.resolve(__dirname, "../../dist/scc/runtime");
  return [getBundledRuntimeIncludeDir(), ...features.map((feature) => path.join(root, "numeric", feature, "include"))];
}

function runtimeFilePath(selection: RuntimeSelection): string {
  if (typeof selection === "string") return path.join(__dirname, "runtime", "legacy", `${selection}.scc.asm`);
  const spec = normalizeBundledRuntime(selection);
  return path.join(__dirname, "runtime", "platform", `${spec.platform}-${spec.profile === "full" ? "lite" : spec.profile}.scc.asm`);
}

export function getBundledSccRuntime(selection: RuntimeSelection): string {
  let source = fs.readFileSync(runtimeFilePath(selection), "utf8");
  if (typeof selection !== "string" && selection.profile === "full") {
    source += `\n${readFullRuntimeSource(path.join(__dirname, "runtime", "lib"))}`;
  }
  if (typeof selection !== "string") {
    for (const feature of requireNumericFeatures(selection.features)) {
      const root = getBundledRuntimeIncludeDirs(selection).find((entry) => entry.endsWith(path.join(feature, "include")))!;
      source += "\n" + fs.readFileSync(path.join(root, "..", "constructors.scc.asm"), "utf8");
      source += "\n" + fs.readFileSync(path.join(root, "..", "cpu.scc.asm"), "utf8");
      for (const name of NUMERIC_C_MEMBERS) source += "\n" + fs.readFileSync(path.join(root, "..", `${name}.generated.scc.asm`), "utf8");
    }
  }
  if (typeof selection === "string" || selection.platform !== "msx-bios") return source;
  const exit = normalizeBundledRuntime(selection).exit === "return"
    ? "\tret"
    : ".halt_loop:\n\thalt\n\tjr\t.halt_loop";
  return source.replace("{{MSX_EXIT}}", exit);
}

export function writeBundledSccRuntime(selection: RuntimeSelection, outputFile: string): void {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, getBundledSccRuntime(selection), "utf8");
}

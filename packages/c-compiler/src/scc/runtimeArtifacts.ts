import fs from "node:fs";
import path from "node:path";
import { assemble } from "@mz80/assembler";
import { createArchive, createLogger } from "@mz80/core";
import { RuntimeSelection, normalizeBundledRuntime } from "./runtime";
import { FULL_RUNTIME_LIBRARY_MODULES } from "./runtimeLibrary";
import { availableNumericFeatures, NUMERIC_C_MEMBERS, requireNumericFeatures } from "./runtimeFeatures";
import { translateSccAsm } from "./translateAsm";
import { TsSccCompilerAdapter } from "./tsCompilerAdapter";

export type BundledRuntimeArtifacts = {
  crtRelPath: string;
  libraryPaths: string[];
  requiredSymbols?: string[];
};

const rawHooks = ["__mz80_raw_putc", "__mz80_raw_getc", "__mz80_raw_exit"];

function artifactRoot(): string {
  // Published code runs from dist/scc. Source-path tests run from src/scc but
  // intentionally consume the artifacts produced by the package build.
  const packaged = path.join(__dirname, "runtime", "artifacts");
  return fs.existsSync(packaged)
    ? packaged
    : path.resolve(__dirname, "../../dist/scc/runtime/artifacts");
}

function crtName(selection: RuntimeSelection): string {
  const spec = normalizeBundledRuntime(selection);
  if (spec.platform === "msx-bios") {
    return `msx-bios-lite-${spec.exit ?? "halt"}-crt.rel`;
  }
  // The full profile supplies its C library through libmz80c-full.lib; CRT
  // startup and platform I/O remain the corresponding lite CRT.
  return `${spec.platform}-lite-crt.rel`;
}

/** Returns installed, prebuilt link inputs for a structured runtime selection. */
export function getBundledRuntimeArtifacts(selection: RuntimeSelection): BundledRuntimeArtifacts {
  if (typeof selection === "string") {
    throw new Error(`Legacy runtime ${selection} has no prebuilt archive artifacts.`);
  }
  const spec = normalizeBundledRuntime(selection);
  const root = artifactRoot();
  const crtRelPath = path.join(root, crtName(selection));
  const libraryPaths = spec.profile === "full" ? [path.join(root, "libmz80c-full.lib")] : [];
  for (const feature of requireNumericFeatures(spec.features)) libraryPaths.push(path.join(root, `libmz80-${feature}-v1.lib`));
  const requiredSymbols = spec.platform === "raw" ? rawHooks : undefined;
  for (const artifact of [crtRelPath, ...libraryPaths]) {
    if (!fs.existsSync(artifact)) throw new Error(`Bundled runtime artifact is missing: ${artifact}`);
  }
  return { crtRelPath, libraryPaths, requiredSymbols };
}

function assembleRuntime(source: string, moduleName: string, output: string): void {
  const tempAsm = path.join(path.dirname(output), path.basename(output).replace(/\.rel$/i, ".asm").replace(/-/g, "_"));
  fs.writeFileSync(tempAsm, translateSccAsm(source, { moduleName: moduleName.replace(/[^A-Za-z0-9_]/g, "_") }), "utf8");
  const result = assemble(createLogger("quiet"), tempAsm, output, { relVersion: 2 });
  fs.rmSync(tempAsm, { force: true });
  if (result.errors.length) throw new Error(`Assembly failed for runtime artifact ${moduleName}: ${result.errors.map((error) => error.message).join("; ")}`);
}

function withPublicHelpers(source: string): string {
  return `${source}\n\t.globl\tmz80_runtime_gchar\n\t.globl\tmz80_runtime_gint\nmz80_runtime_gchar:\n\tjp\t.gchar\nmz80_runtime_gint:\n\tjp\t.gint\n`;
}

function libraryModule(source: string, exports: string[], externs: string[]): string {
  return [
    ...exports.map((symbol) => `\t.globl\t${symbol}`),
    ...externs.map((symbol) => `\tEXTERN\t${symbol}`),
    "\t.area\t_CODE",
    source,
  ].join("\n");
}

/** Invoked after TypeScript compilation to make deterministic distributable runtime artifacts. */
export function buildBundledRuntimeArtifacts(): void {
  const root = artifactRoot();
  fs.mkdirSync(root, { recursive: true });
  const runtimeRoot = path.join(__dirname, "runtime");
  const platformRoot = path.join(runtimeRoot, "platform");
  const libraryRoot = path.join(runtimeRoot, "lib");
  const cpmLite = fs.readFileSync(path.join(platformRoot, "cpm-lite.scc.asm"), "utf8");
  const msxLite = fs.readFileSync(path.join(platformRoot, "msx-bios-lite.scc.asm"), "utf8");
  const rawLite = fs.readFileSync(path.join(platformRoot, "raw-lite.scc.asm"), "utf8");

  assembleRuntime(withPublicHelpers(cpmLite), "cpm-lite-crt", path.join(root, "cpm-lite-crt.rel"));
  assembleRuntime(withPublicHelpers(msxLite.replace("{{MSX_EXIT}}", ".halt_loop:\n\thalt\n\tjr\t.halt_loop")), "msx-bios-lite-halt-crt", path.join(root, "msx-bios-lite-halt-crt.rel"));
  assembleRuntime(withPublicHelpers(msxLite.replace("{{MSX_EXIT}}", "\tret")), "msx-bios-lite-return-crt", path.join(root, "msx-bios-lite-return-crt.rel"));
  assembleRuntime(withPublicHelpers(rawLite), "raw-lite-crt", path.join(root, "raw-lite-crt.rel"));

  const modules = FULL_RUNTIME_LIBRARY_MODULES.map((module) => ({
    ...module,
    source: fs.readFileSync(path.join(libraryRoot, module.file), "utf8"),
  }));
  const moduleRelFiles = modules.map(({ name }) => path.join(root, `${name}.rel`));
  try {
    modules.forEach((module, index) => {
      const source = libraryModule(module.source, module.exports, module.externs)
        .replace(/\.gchar\b/g, "mz80_runtime_gchar")
        .replace(/\.gint\b/g, "mz80_runtime_gint");
      assembleRuntime(source, module.name, moduleRelFiles[index]);
    });
    createArchive(moduleRelFiles, path.join(root, "libmz80c-full.lib"));
  } finally {
    for (const relFile of moduleRelFiles) fs.rmSync(relFile, { force: true });
  }
  for (const feature of availableNumericFeatures()) {
    const featureRoot = path.join(runtimeRoot, "numeric", feature);
    const members = ["constructors", "cpu", ...NUMERIC_C_MEMBERS];
    const relFiles = members.map((name) => path.join(root, `mz80_${feature}_v1_${name}.rel`));
    const staging = fs.mkdtempSync(path.join(root, "numeric-build-"));
    try {
      members.forEach((name, index) => {
        let source: string;
        if ((NUMERIC_C_MEMBERS as readonly string[]).includes(name)) {
          const result = new TsSccCompilerAdapter().compileToRel(createLogger("quiet"), {
            inputFile: path.join(featureRoot, `${name}.c`), tempDir: staging,
            bundledIncludeDirs: [path.join(runtimeRoot, "include"), path.join(featureRoot, "include")],
            defines: { [`MZ80_FEATURE_${feature.toUpperCase()}`]: "1" }, runtimeFeatures: [feature],
          });
          source = fs.readFileSync(result.sccAsmFile, "utf8")
            .replace(/\.(eq|ne|lt|le|gt|ge|asl|asr|mul)\b/g, `mz80_${feature}_cpu_$1`);
          fs.writeFileSync(path.join(featureRoot, `${name}.generated.scc.asm`), source);
        } else source = fs.readFileSync(path.join(featureRoot, `${name}.scc.asm`), "utf8");
        assembleRuntime(source, `mz80_${feature}_v1_${name}`, relFiles[index]);
      });
      createArchive(relFiles, path.join(root, `libmz80-${feature}-v1.lib`));
    } finally {
      for (const relFile of relFiles) fs.rmSync(relFile, { force: true });
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }
}

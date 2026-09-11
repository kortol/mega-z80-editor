import fs from "node:fs";
import path from "node:path";
import { assemble } from "@mz80/assembler";
import { createArchive, createLogger } from "@mz80/core";
import { RuntimeSelection, normalizeBundledRuntime } from "./runtime";
import { translateSccAsm } from "./translateAsm";

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
  const requiredSymbols = spec.platform === "raw" ? rawHooks : undefined;
  for (const artifact of [crtRelPath, ...libraryPaths]) {
    if (!fs.existsSync(artifact)) throw new Error(`Bundled runtime artifact is missing: ${artifact}`);
  }
  return { crtRelPath, libraryPaths, requiredSymbols };
}

function assembleRuntime(source: string, moduleName: string, output: string): void {
  const tempAsm = output.replace(/\.rel$/i, ".asm");
  fs.writeFileSync(tempAsm, translateSccAsm(source, { moduleName }), "utf8");
  const result = assemble(createLogger("quiet"), tempAsm, output, { relVersion: 2 });
  fs.rmSync(tempAsm, { force: true });
  if (result.errors.length) throw new Error(`Assembly failed for runtime artifact ${moduleName}: ${result.errors.map((error) => error.message).join("; ")}`);
}

function withPublicHelpers(source: string): string {
  return `${source}\n\t.globl\tmz80_runtime_gchar\n\t.globl\tmz80_runtime_gint\nmz80_runtime_gchar:\n\tjp\t.gchar\nmz80_runtime_gint:\n\tjp\t.gint\n`;
}

function extractRuntimeSection(source: string, firstLabel: string, nextLabel?: string): string {
  const start = source.indexOf(`\n${firstLabel}:`);
  const end = nextLabel ? source.indexOf(`\n${nextLabel}:`, start + 1) : source.length;
  if (start < 0 || end < 0) throw new Error(`Cannot split bundled runtime section ${firstLabel}.`);
  return source.slice(start + 1, end);
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
  const cpmLite = fs.readFileSync(path.join(runtimeRoot, "cpm-lite.scc.asm"), "utf8");
  const msxLite = fs.readFileSync(path.join(runtimeRoot, "msx-bios-lite.scc.asm"), "utf8");
  const rawLite = fs.readFileSync(path.join(runtimeRoot, "raw-lite.scc.asm"), "utf8");
  const full = fs.readFileSync(path.join(runtimeRoot, "full.scc.asm"), "utf8");

  assembleRuntime(withPublicHelpers(cpmLite), "cpm-lite-crt", path.join(root, "cpm-lite-crt.rel"));
  assembleRuntime(withPublicHelpers(msxLite.replace("{{MSX_EXIT}}", ".halt_loop:\n\thalt\n\tjr\t.halt_loop")), "msx-bios-lite-halt-crt", path.join(root, "msx-bios-lite-halt-crt.rel"));
  assembleRuntime(withPublicHelpers(msxLite.replace("{{MSX_EXIT}}", "\tret")), "msx-bios-lite-return-crt", path.join(root, "msx-bios-lite-return-crt.rel"));
  assembleRuntime(withPublicHelpers(rawLite), "raw-lite-crt", path.join(root, "raw-lite-crt.rel"));

  const modules: Array<{ name: string; exports: string[]; externs: string[]; source: string }> = [
    {
      name: "mz80c-stdlib",
      exports: ["abs", "atoi", "__mz80_assert", "rand", "srand", "mz80_full_atoi_negative", "mz80_full_atoi_pointer", "mz80_full_rand_seed"],
      externs: ["exit", "mz80_runtime_gint"],
      source: extractRuntimeSection(full, "abs", "strlen"),
    },
    {
      name: "mz80c-string",
      exports: ["strlen", "memcpy", "memmove", "memset", "strcmp", "strcoll", "strxfrm", "memcmp", "strcpy", "strcat", "strncat", "strncpy", "strncmp", "strchr", "strrchr", "strpbrk", "strspn", "strcspn", "strstr", "strtok", "mz80_full_memset_value", "mz80_full_strxfrm_remaining", "mz80_full_strxfrm_source", "mz80_full_strxfrm_destination", "mz80_full_strxfrm_char", "mz80_full_strstr_needle", "mz80_full_strstr_cursor", "mz80_full_strstr_candidate", "mz80_full_strpbrk_accept", "mz80_full_span_accept", "mz80_full_strtok_is_delimiter", "mz80_full_strtok_delimiters", "mz80_full_strtok_cursor", "mz80_full_strtok_token"],
      externs: ["mz80_runtime_gchar", "mz80_runtime_gint"],
      source: extractRuntimeSection(full, "strlen", "isalpha"),
    },
    {
      name: "mz80c-ctype",
      exports: ["isalpha", "isalnum", "iscntrl", "isdigit", "isgraph", "islower", "isprint", "ispunct", "isupper", "isspace", "isxdigit", "tolower", "toupper", "mz80_full_isalpha_a"],
      externs: ["mz80_runtime_gchar"],
      source: extractRuntimeSection(full, "isalpha", "printf"),
    },
    {
      name: "mz80c-stdio",
      exports: ["printf", "sprintf", "mz80_full_vformat", "mz80_full_next_arg", "mz80_full_emit", "mz80_full_emit_unsigned", "mz80_full_emit_signed", "mz80_full_emit_hex_lower", "mz80_full_emit_hex_upper", "mz80_full_emit_hex", "mz80_full_emit_hex_recurse", "mz80_full_emit_hex_fixed", "mz80_full_emit_hex_digit", "mz80_full_format_loop", "mz80_full_hex_alpha"],
      externs: ["putchar", "mz80_runtime_gchar", "mz80_runtime_gint"],
      source: extractRuntimeSection(full, "printf"),
    },
  ];
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
}

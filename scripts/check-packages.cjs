/* Verify the four publishable packages as the artifacts users actually install. */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packages = ["core", "assembler", "c-compiler", "cli"];
const publicNames = new Set(packages.map((name) => `@mz80/${name}`));
const expectedVersion = "0.1.0";
const expectedRepository = "https://github.com/kortol/mega-z80-editor.git";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-pack-"));
const fail = (message) => { throw new Error(`[pack] ${message}`); };
const run = (command, args, cwd) => execFileSync(command, args, {
  cwd,
  stdio: "inherit",
  shell: process.platform === "win32",
});
const tarText = (archive, entry) => execFileSync("tar", ["-xOf", archive, entry], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
const tarEntries = (archive) => execFileSync("tar", ["-tzf", archive], {
  encoding: "utf8",
  shell: process.platform === "win32",
}).split(/\r?\n/).filter(Boolean);
const getTargets = (value) => {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(getTargets);
};
const dependencySections = ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"];
const privateWorkspaceNames = new Set(
  [path.join(root, "packages"), path.join(root, "editor")]
    .flatMap((dir) => fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name, "package.json"))
      .filter((file) => fs.existsSync(file)))
    .map((file) => JSON.parse(fs.readFileSync(file, "utf8")))
    .filter((manifest) => manifest.private === true)
    .map((manifest) => manifest.name),
);
const allowedTarballEntry = (shortName, entry) => {
  if (["package/package.json", "package/README.md", "package/LICENSE"].includes(entry)) return true;
  if (entry.startsWith("package/dist/")) return true;
  return shortName === "c-compiler" && entry.startsWith("package/docs/");
};
const tarMode = (archive, entry) => execFileSync("tar", ["-tvzf", archive, entry], {
  encoding: "utf8",
  shell: process.platform === "win32",
}).trim();

try {
  // Packing always starts from one clean, dependency-ordered root build.
  run("pnpm", ["run", "build"], root);
  const archives = new Map();
  for (const name of packages) {
    const packageDir = path.join(root, "packages", name);
    run("pnpm", ["pack", "--pack-destination", temp], packageDir);
    const matches = fs.readdirSync(temp)
      .filter((file) => file.endsWith(".tgz") && file.includes(`mz80-${name.replace("-", "-")}`));
    if (matches.length !== 1) fail(`${name}: expected exactly one tarball, found ${matches.join(", ") || "none"}`);
    archives.set(name, path.join(temp, matches[0]));
  }

  for (const [shortName, archive] of archives) {
    const entries = tarEntries(archive);
    const packageJsonEntry = "package/package.json";
    if (!entries.includes(packageJsonEntry)) fail(`${shortName}: package.json is absent`);
    const manifest = JSON.parse(tarText(archive, packageJsonEntry));
    if (manifest.version !== expectedVersion) fail(`${shortName}: packed version is not ${expectedVersion}`);
    if (manifest.private === true) fail(`${shortName}: packed package must not be private`);
    if (manifest.license !== "MIT") fail(`${shortName}: packed license must be MIT`);
    if (manifest.repository?.type !== "git" || manifest.repository?.url !== expectedRepository || manifest.repository?.directory !== `packages/${shortName}`) {
      fail(`${shortName}: packed repository metadata is incomplete`);
    }
    if (manifest.engines?.node !== ">=18") fail(`${shortName}: packed engines.node must be >=18`);
    if (manifest.publishConfig?.access !== "public") fail(`${shortName}: packed publishConfig.access must be public`);
    for (const section of dependencySections) {
      for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
        if (typeof spec !== "string" || /^(workspace:|file:|link:|[A-Za-z]:[\\/]|\/)/.test(spec)) {
          fail(`${shortName}: invalid packed dependency ${name}@${spec}`);
        }
        if (privateWorkspaceNames.has(name)) fail(`${shortName}: packed manifest depends on private workspace package ${name}`);
        if (name.startsWith("@mz80/") && (!publicNames.has(name) || spec !== expectedVersion)) {
          fail(`${shortName}: internal dependency ${name}@${spec} is not publishable ${expectedVersion}`);
        }
      }
    }
    const targets = [...getTargets(manifest.exports), manifest.types, ...Object.values(manifest.bin || {})]
      .filter((target) => typeof target === "string");
    for (const target of targets) {
      const entry = `package/${target.replace(/^\.\//, "")}`;
      if (!entries.includes(entry)) fail(`${shortName}: packed target is absent: ${target}`);
    }
    const unexpected = entries.filter((entry) => !allowedTarballEntry(shortName, entry));
    if (unexpected.length) fail(`${shortName}: tarball entry is outside the allowlist: ${unexpected.join(", ")}`);
    const forbidden = entries.filter((entry) => /(^|\/)(\.env(?:\.|$)|node_modules|__tests__|fixtures?|\.vscode|\.npmrc)(\/|$)|(?<!\.d)\.ts$|\.tsx$|\.map$/.test(entry));
    if (forbidden.length) fail(`${shortName}: forbidden tarball content: ${forbidden.join(", ")}`);
    for (const mapEntry of entries.filter((entry) => entry.endsWith(".map"))) {
      if (/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(tarText(archive, mapEntry))) fail(`${shortName}: source map contains an absolute path: ${mapEntry}`);
    }
    const required = ["package/dist/index.js", "package/dist/index.d.ts"];
    if (shortName === "assembler") required.push("package/dist/parser/gen/z80_assembler.js", "package/dist/grammar/z80_assembler.pegjs", "package/dist/grammar/z80_mnemonics.json");
    if (shortName === "c-compiler") required.push(
      "package/dist/scc/runtime/cpm-lite.scc.asm",
      "package/dist/scc/runtime/msx-bios-lite.scc.asm",
      "package/dist/scc/runtime/raw-lite.scc.asm",
      "package/dist/scc/runtime/full.scc.asm",
      "package/dist/scc/runtime/artifacts/cpm-lite-crt.rel",
      "package/dist/scc/runtime/artifacts/msx-bios-lite-halt-crt.rel",
      "package/dist/scc/runtime/artifacts/msx-bios-lite-return-crt.rel",
      "package/dist/scc/runtime/artifacts/raw-lite-crt.rel",
      "package/dist/scc/runtime/artifacts/libmz80c-full.lib",
      "package/dist/scc/runtime/include/stdio.h",
      "package/dist/scc/runtime/include/string.h",
      "package/dist/scc/runtime/include/ctype.h",
      "package/dist/scc/runtime/include/mz80.h",
      "package/dist/scc/runtime/include/stddef.h",
      "package/dist/scc/runtime/include/stdlib.h",
      "package/dist/scc/runtime/include/assert.h",
      "package/dist/scc/runtime/include/stdarg.h",
    );
    for (const entry of required) if (!entries.some((actual) => actual === entry || actual.startsWith(`${entry}/`))) fail(`${shortName}: required runtime asset is absent: ${entry}`);
    if (shortName === "cli") {
      const bin = manifest.bin?.mz80;
      if (typeof bin !== "string") fail("cli: packed mz80 bin is absent");
      else {
        const entry = `package/${bin.replace(/^\.\//, "")}`;
        const source = tarText(archive, entry);
        if (!source.startsWith("#!/usr/bin/env node")) fail("cli: packed bin must have a node shebang");
        if (!/^-..x/.test(tarMode(archive, entry))) fail("cli: packed bin must be executable");
      }
    }
  }

  const installRoot = path.join(temp, "clean-install");
  fs.mkdirSync(installRoot);
  const tarballDependencies = Object.fromEntries([...archives.entries()].map(([shortName, archive]) => [
    `@mz80/${shortName}`,
    `file:${path.relative(installRoot, archive).replace(/\\/g, "/")}`,
  ]));
  // The direct dependencies and overrides both point to the four local
  // tarballs. This prevents a transitive @mz80/*@0.1.0 request from falling
  // back to the registry while still permitting public third-party packages.
  fs.writeFileSync(path.join(installRoot, "package.json"), JSON.stringify({
    name: "mz80-clean-install",
    private: true,
    dependencies: tarballDependencies,
    devDependencies: {
      "@types/node": "^24.5.2",
      typescript: "^5.9.2",
    },
    pnpm: { overrides: tarballDependencies },
  }, null, 2));
  run("pnpm", ["install"], installRoot);
  run(process.execPath, ["-e", "require('@mz80/core'); require('@mz80/assembler'); require('@mz80/assembler/grammar/z80_mnemonics.json'); require('@mz80/c-compiler'); require('@mz80/cli')"], installRoot);
  const typeTest = path.join(installRoot, "public-api.ts");
  fs.writeFileSync(typeTest, [
    "import * as core from '@mz80/core';",
    "import * as assembler from '@mz80/assembler';",
    "import * as ccompiler from '@mz80/c-compiler';",
    "import * as cli from '@mz80/cli';",
    "import mnemonics from '@mz80/assembler/grammar/z80_mnemonics.json';",
    "void [core, assembler, ccompiler, cli, mnemonics];",
    "",
  ].join("\n"));
  run(path.join(installRoot, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc"), ["--noEmit", "--module", "node16", "--moduleResolution", "node16", "--resolveJsonModule", "--target", "es2022", typeTest], installRoot);

  const fixture = path.join(installRoot, "smoke");
  const stage = path.join(fixture, "stage");
  fs.mkdirSync(stage, { recursive: true });
  const asmSource = ["SECTION TEXT", "PUBLIC _main", "_main:", "\tNOP", "\tRET", "END", ""].join("\n");
  const asmFile = path.join(fixture, "main.asm");
  const cFile = path.join(fixture, "main.c");
  fs.writeFileSync(asmFile, asmSource, "utf8");
  fs.writeFileSync(cFile, "int main(){ return 0; }\n", "utf8");
  const apiSmoke = path.join(fixture, "public-api-smoke.cjs");
  fs.writeFileSync(apiSmoke, [
    "const assert = require('node:assert/strict');",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const { createLogger } = require('@mz80/core');",
    "const { assemble } = require('@mz80/assembler');",
    "const { compileCFile } = require('@mz80/c-compiler');",
    "const root = process.argv[2];",
    "const logger = createLogger('quiet');",
    "const asm = path.join(root, 'main.asm');",
    "const assembled = path.join(root, 'public-api.rel');",
    "const context = assemble(logger, asm, assembled, { relVersion: 2 });",
    "assert.deepEqual(context.errors, []);",
    "assert.ok(fs.existsSync(assembled), 'assembler public API did not produce REL');",
    "const compiled = compileCFile(logger, {",
    "  inputFile: path.join(root, 'main.c'),",
    "  outputRelFile: path.join(root, 'public-c.rel'),",
    "  tempDir: path.join(root, 'stage'),",
    "});",
    "assert.ok(fs.existsSync(compiled.relFile), 'C compiler public API did not produce REL');",
    "",
  ].join("\n"));
  run(process.execPath, [apiSmoke, fixture], installRoot);

  const cli = path.join(installRoot, "node_modules", "@mz80", "cli", "dist", "index.js");
  const cliBin = path.join(installRoot, "node_modules", ".bin", process.platform === "win32" ? "mz80.cmd" : "mz80");
  run(cliBin, ["--help"], installRoot);
  const cliRel = path.join(fixture, "cli.rel");
  const linked = path.join(fixture, "cli.bin");
  run(cliBin, ["as", asmFile, cliRel, "--quiet"], installRoot);
  if (!fs.existsSync(cliRel)) fail("clean install CLI assembler did not produce REL");
  run(cliBin, ["link", linked, cliRel, "--quiet"], installRoot);
  if (!fs.existsSync(linked)) fail("clean install CLI linker did not produce binary");

  fs.writeFileSync(path.join(fixture, "mz80.yaml"), [
    "project:",
    "  defaultTarget: smoke",
    "targets:",
    "  smoke:",
    "    output: build/project.bin",
    "    modules:",
    "      - main.asm",
    "",
  ].join("\n"), "utf8");
  run(cliBin, ["build", "--quiet"], fixture);
  if (!fs.existsSync(path.join(fixture, "build", "project.bin"))) fail("clean install CLI project build did not produce binary");
  run(process.execPath, [path.join(root, "scripts", "smoke-dap.cjs"), cli], installRoot);
  console.log("[pack] tarball metadata, entrypoints, assets, public APIs, CLI, project build, and DAP clean-install paths are valid");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

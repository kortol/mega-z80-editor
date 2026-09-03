/* Verify the four publishable packages as the artifacts users actually install. */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packages = ["core", "assembler", "c-compiler", "cli"];
const publicNames = new Set(packages.map((name) => `@mz80/${name}`));
const expectedVersion = "0.1.0";
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
    for (const [name, spec] of Object.entries({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })) {
      if (/^(workspace:|file:|[A-Za-z]:[\\/]|\/)/.test(spec)) fail(`${shortName}: invalid packed dependency ${name}@${spec}`);
      if (name.startsWith("@mz80/") && (!publicNames.has(name) || spec !== expectedVersion)) {
        fail(`${shortName}: internal dependency ${name}@${spec} is not publishable ${expectedVersion}`);
      }
    }
    const targets = [...getTargets(manifest.exports), manifest.types, ...Object.values(manifest.bin || {})]
      .filter((target) => typeof target === "string");
    for (const target of targets) {
      const entry = `package/${target.replace(/^\.\//, "")}`;
      if (!entries.includes(entry)) fail(`${shortName}: packed target is absent: ${target}`);
    }
    const forbidden = entries.filter((entry) => /(^|\/)(\.env|node_modules|__tests__|fixtures?)(\/|$)|\.ts$|\.tsx$/.test(entry));
    if (forbidden.length) fail(`${shortName}: forbidden tarball content: ${forbidden.join(", ")}`);
    for (const mapEntry of entries.filter((entry) => entry.endsWith(".map"))) {
      if (/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(tarText(archive, mapEntry))) fail(`${shortName}: source map contains an absolute path: ${mapEntry}`);
    }
    const required = ["package/dist/index.js", "package/dist/index.d.ts"];
    if (shortName === "assembler") required.push("package/dist/parser/gen/z80_assembler.js", "package/dist/grammar/z80_assembler.pegjs");
    if (shortName === "c-compiler") required.push("package/dist/scc/runtime");
    for (const entry of required) if (!entries.some((actual) => actual === entry || actual.startsWith(`${entry}/`))) fail(`${shortName}: required runtime asset is absent: ${entry}`);
  }

  const installRoot = path.join(temp, "clean-install");
  fs.mkdirSync(installRoot);
  fs.writeFileSync(path.join(installRoot, "package.json"), JSON.stringify({ name: "mz80-clean-install", private: true }, null, 2));
  run("pnpm", ["add", "--offline", ...[...archives.values()]], installRoot);
  run(process.execPath, ["-e", "require('@mz80/core'); require('@mz80/assembler'); require('@mz80/c-compiler'); require('@mz80/cli')"], installRoot);
  const typeTest = path.join(installRoot, "public-api.ts");
  fs.writeFileSync(typeTest, "import * as core from '@mz80/core'; import * as assembler from '@mz80/assembler'; import * as ccompiler from '@mz80/c-compiler'; import * as cli from '@mz80/cli'; void [core, assembler, ccompiler, cli];\n");
  run(path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc"), ["--noEmit", "--module", "node16", "--moduleResolution", "node16", "--target", "es2022", typeTest], installRoot);
  const cli = path.join(installRoot, "node_modules", "@mz80", "cli", "dist", "index.js");
  run(process.execPath, [cli, "--help"], installRoot);
  console.log("[pack] tarball metadata, entrypoints, assets, and clean-install imports are valid");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

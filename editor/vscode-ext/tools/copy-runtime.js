const fs = require("node:fs");
const path = require("node:path");

const EXT_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXT_ROOT, "..", "..");
const SERVER_ROOT = path.join(EXT_ROOT, "server");

const SOURCES = [
  ["packages/core", "@mz80/core"],
  ["packages/assembler", "@mz80/assembler"],
  ["packages/c-compiler", "@mz80/c-compiler"],
  ["packages/cli", "@mz80/cli"],
  ["editor/lsp", "@mz80/lsp"],
];
const copiedExternal = new Set();

function resetDir(target) {
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(target, { recursive: true });
}

function copyTree(from, to) {
  if (!fs.existsSync(from)) {
    throw new Error(`Runtime source not found: ${from}`);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

function packageDirectory(packageName, fromDir) {
  let current = path.dirname(require.resolve(packageName, { paths: [fromDir] }));
  while (!fs.existsSync(path.join(current, "package.json"))) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Package manifest not found for ${packageName}`);
    current = parent;
  }
  return current;
}

function copyExternalDependency(packageName, fromDir) {
  if (packageName.startsWith("@mz80/") || copiedExternal.has(packageName)) return;
  copiedExternal.add(packageName);
  const from = packageDirectory(packageName, fromDir);
  copyTree(from, path.join(SERVER_ROOT, "node_modules", packageName));
  const manifest = JSON.parse(fs.readFileSync(path.join(from, "package.json"), "utf8"));
  for (const child of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    copyExternalDependency(child, from);
  }
}

function main() {
  resetDir(SERVER_ROOT);
  for (const [source, packageName] of SOURCES) {
    const from = path.join(REPO_ROOT, source);
    const to = path.join(SERVER_ROOT, "node_modules", packageName);
    fs.mkdirSync(to, { recursive: true });
    copyTree(path.join(from, "dist"), path.join(to, "dist"));
    fs.copyFileSync(path.join(from, "package.json"), path.join(to, "package.json"));
    const manifest = JSON.parse(fs.readFileSync(path.join(from, "package.json"), "utf8"));
    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
      copyExternalDependency(dependency, from);
    }
  }
  const extensionManifest = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, "package.json"), "utf8"));
  for (const dependency of Object.keys({ ...extensionManifest.dependencies, ...extensionManifest.optionalDependencies })) {
    copyExternalDependency(dependency, EXT_ROOT);
  }
  console.log(`[copy-runtime] staged runtimes under ${SERVER_ROOT}`);
}

main();

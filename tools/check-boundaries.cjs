const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const rules = {
  "@mz80/core": new Set(),
  "@mz80/assembler": new Set(["@mz80/core"]),
  "@mz80/c-compiler": new Set(["@mz80/core", "@mz80/assembler"]),
  "@mz80/cli": new Set(["@mz80/core", "@mz80/assembler", "@mz80/c-compiler"]),
  "@mz80/lsp": new Set(["@mz80/assembler"]),
};
const dirs = Object.entries({
  "@mz80/core": "packages/core",
  "@mz80/assembler": "packages/assembler",
  "@mz80/c-compiler": "packages/c-compiler",
  "@mz80/cli": "packages/cli",
  "@mz80/lsp": "editor/lsp",
});
let failed = false;
const fail = (file, message) => { failed = true; console.error(`[boundaries] ${path.relative(root, file)}: ${message}`); };
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
for (const [owner, rel] of dirs) {
  const pkgDir = path.join(root, rel);
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  for (const dep of Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) })) {
    if (dep.startsWith("@mz80/") && !rules[owner].has(dep)) fail(path.join(pkgDir, "package.json"), `${owner} must not depend on ${dep}`);
  }
  for (const file of walk(path.join(pkgDir, "src")).filter((file) => /\.[cm]?[jt]s$/.test(file))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:from\s*|require\()["']([^"']+)["']/g)) {
      const spec = match[1];
      if (spec.includes("/src/") || spec.includes("/dist/")) fail(file, `source/dist deep import: ${spec}`);
      if (spec.startsWith("@mz80/") && !rules[owner].has(spec)) fail(file, `forbidden package import: ${spec}`);
      if (spec.startsWith("@mz80/") && spec.split("/").length > 2) fail(file, `non-public subpath import: ${spec}`);
      if (/^\.\.?\//.test(spec) && spec.includes("packages/")) fail(file, `cross-package relative import: ${spec}`);
    }
  }
}
const extensionSource = path.join(root, "editor", "vscode-ext", "src");
for (const file of walk(extensionSource).filter((file) => /\.[cm]?[jt]s$/.test(file))) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:from\s*|require\()["']([^"']+)["']/g)) {
    const spec = match[1];
    if (spec.startsWith("@mz80/")) fail(file, `VS Code extension must not import a toolchain package directly: ${spec}`);
    if (spec.includes("/src/") || spec.includes("/dist/")) fail(file, `VS Code extension source/dist deep import: ${spec}`);
  }
}
if (failed) process.exit(1);
console.log("[boundaries] package dependency direction and public import boundary are valid");

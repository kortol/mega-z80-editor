const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const publicPackages = ["core", "assembler", "c-compiler", "cli"];
const expectedVersion = "0.1.0";
const expectedPnpm = "pnpm@9.12.0";
const expectedBuiltDependencies = ["@vscode/vsce-sign", "unrs-resolver"];
let failed = false;
const fail = (message) => { failed = true; console.error(`[versions] ${message}`); };

const rootManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (rootManifest.packageManager !== expectedPnpm) fail(`root packageManager must be ${expectedPnpm}`);
const allowedBuilds = rootManifest.pnpm?.onlyBuiltDependencies;
if (!Array.isArray(allowedBuilds) || allowedBuilds.length !== expectedBuiltDependencies.length ||
  expectedBuiltDependencies.some((name) => !allowedBuilds.includes(name))) {
  fail(`root pnpm.onlyBuiltDependencies must be ${expectedBuiltDependencies.join(", ")}`);
}
const workspaceFile = path.join(root, "pnpm-workspace.yaml");
const workspaceText = fs.readFileSync(workspaceFile, "utf8");
if (/^allowBuilds:/m.test(workspaceText)) fail("pnpm 9 build policy must not use pnpm-workspace.yaml allowBuilds");
for (const workspacePackage of ["packages/*", "editor/*"]) {
  if (!workspaceText.includes(`- \"${workspacePackage}\"`)) {
    fail(`pnpm-workspace.yaml must include ${workspacePackage}`);
  }
}

function packageJson(name) {
  const file = path.join(root, "packages", name, "package.json");
  return { file, json: JSON.parse(fs.readFileSync(file, "utf8")) };
}
function targetExists(dir, target) {
  if (typeof target !== "string") return true;
  return fs.existsSync(path.join(dir, target.replace(/^\.\//, "")));
}
for (const name of publicPackages) {
  const { file, json } = packageJson(name);
  const dir = path.dirname(file);
  if (json.version !== expectedVersion) fail(`${json.name}: expected version ${expectedVersion}`);
  if (json.private === true) fail(`${json.name}: must not be private`);
  if (json.publishConfig?.access !== "public") fail(`${json.name}: publishConfig.access must be public`);
  if (!json.exports || !json.types) fail(`${json.name}: exports and types are required`);
  if (!targetExists(dir, json.types)) fail(`${json.name}: missing types target ${json.types}`);
  if (json.bin) for (const target of Object.values(json.bin)) if (!targetExists(dir, target)) fail(`${json.name}: missing bin target ${target}`);
  for (const [dep, spec] of Object.entries(json.dependencies ?? {})) {
    if (dep.startsWith("@mz80/") && spec !== "workspace:*") fail(`${json.name}: ${dep} must use workspace:* before pack`);
  }
}
if (failed) process.exit(1);
console.log("[versions] public package versions and built entrypoints are valid");

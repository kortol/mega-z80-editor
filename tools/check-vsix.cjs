const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extension = path.join(root, "editor", "vscode-ext");
const archive = path.join(extension, "z80-assembler-language-0.0.0.vsix");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-vsix-"));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
const fail = (message) => { throw new Error(`[vsix] ${message}`); };

function walkFiles(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(current, entry.name);
    return entry.isDirectory() ? walkFiles(root, full) : [path.relative(root, full).replace(/\\/g, "/")];
  });
}

function requireFile(root, relative, description = relative) {
  if (!fs.existsSync(path.join(root, relative))) fail(`missing packaged ${description}: ${relative}`);
}

function verifyExtensionContents(extracted) {
  const manifestPath = path.join(extracted, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (typeof manifest.main !== "string") fail("extension manifest main is absent");
  requireFile(extracted, manifest.main.replace(/^\.\//, ""), "extension main");
  requireFile(extracted, manifest.icon, "extension icon");
  const language = manifest.contributes?.languages?.find((entry) => entry.id === "z80-asm");
  if (!language?.configuration) fail("z80-asm language configuration is absent");
  requireFile(extracted, language.configuration.replace(/^\.\//, ""), "language configuration");
  const grammar = manifest.contributes?.grammars?.find((entry) => entry.language === "z80-asm");
  if (!grammar?.path) fail("z80-asm grammar contribution is absent");
  requireFile(extracted, grammar.path.replace(/^\.\//, ""), "TextMate grammar");
  if (!manifest.contributes?.debuggers?.some((entry) => entry.type === "mz80-dap")) fail("mz80-dap debugger contribution is absent");
  if (!manifest.activationEvents?.includes("onLanguage:z80-asm")) fail("z80-asm activation event is absent");

  const files = walkFiles(extracted);
  const ownedFiles = files.filter((entry) => !entry.startsWith("node_modules/") && !entry.startsWith("server/node_modules/"));
  const internalRuntimeFiles = files.filter((entry) => entry.startsWith("server/node_modules/@mz80/"));
  const forbidden = [...ownedFiles, ...internalRuntimeFiles].filter((entry) => /(^|\/)(\.env(?:\.|$)|\.npmrc|\.git|src|tools|__tests__|fixtures?|\.vscode)(\/|$)|(^|\/)(?:pnpm-lock|package-lock|yarn\.lock)|(?<!\.d)\.ts$|\.tsx$|\.map$/i.test(entry));
  if (forbidden.length) fail(`forbidden extension-owned or MZ80 runtime content: ${forbidden.join(", ")}`);
  const workspaceRoots = [root, root.replace(/\\/g, "/")];
  for (const file of files.filter((entry) => entry.startsWith("dist/") || entry.startsWith("server/node_modules/@mz80/"))) {
    const content = fs.readFileSync(path.join(extracted, file), "utf8");
    if (workspaceRoots.some((workspaceRoot) => content.includes(workspaceRoot)) ||
      /packages[\\/]cli[\\/]src[\\/](?:assembler|linker|debugger|scc)|packages[\\/]assembler[\\/]src/.test(content)) {
      fail(`repository or absolute path leaked into runtime: ${file}`);
    }
  }
}

function verifyRuntimeManifests(runtime) {
  for (const packageName of ["core", "assembler", "c-compiler", "cli", "lsp"]) {
    const manifestPath = path.join(runtime, "@mz80", packageName, "package.json");
    requireFile(runtime, path.relative(runtime, manifestPath), `@mz80/${packageName} manifest`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const section of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [dependency, spec] of Object.entries(manifest[section] ?? {})) {
        if (typeof spec !== "string" || /^(workspace:|file:|link:|[A-Za-z]:[\\/]|\/)/.test(spec)) {
          fail(`@mz80/${packageName}: invalid bundled ${section} entry ${dependency}@${spec}`);
        }
      }
    }
  }
}

try {
  fs.rmSync(archive, { force: true });
  // The root check already performed the dependency-ordered build.  Package
  // exactly those artifacts instead of allowing VSIX packaging to rebuild a
  // different runtime set.
  run("pnpm", ["run", "package:vsix:prepared"], extension);
  run("tar", ["-xf", archive, "-C", temp], extension);
  const extracted = path.join(temp, "extension");
  verifyExtensionContents(extracted);
  const runtime = path.join(extracted, "server", "node_modules");
  const required = [
    "@mz80/core/dist/index.js",
    "@mz80/assembler/dist/index.js",
    "@mz80/c-compiler/dist/index.js",
    "@mz80/cli/dist/index.js",
    "@mz80/lsp/dist/index.js",
    "vscode-languageclient/node.js",
    "yaml/package.json",
  ];
  for (const relative of required) {
    requireFile(runtime, relative, "runtime");
  }
  verifyRuntimeManifests(runtime);
  run(process.execPath, [path.join(runtime, "@mz80", "cli", "dist", "index.js"), "--help"], temp);
  run(process.execPath, [path.join(root, "tools", "smoke-vsix-runtime.cjs"), extracted], root);
  run(process.execPath, [path.join(root, "tools", "run-vsix-extension-host.cjs"), extracted], root);
  console.log("[vsix] package content, LSP, CLI, DAP, and runtime dependencies are self-contained");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(archive, { force: true });
}

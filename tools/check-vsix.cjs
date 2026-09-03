const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extension = path.join(root, "editor", "vscode-ext");
const archive = path.join(extension, "z80-assembler-language-0.0.0.vsix");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-vsix-"));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });

try {
  fs.rmSync(archive, { force: true });
  run("pnpm", ["run", "package:vsix"], extension);
  run("tar", ["-xf", archive, "-C", temp], extension);
  const runtime = path.join(temp, "extension", "server", "node_modules");
  const required = [
    "@mz80/core/dist/index.js",
    "@mz80/assembler/dist/index.js",
    "@mz80/c-compiler/dist/index.js",
    "@mz80/cli/dist/index.js",
    "@mz80/lsp/dist/index.js",
    "vscode-languageclient/node.js",
  ];
  for (const relative of required) {
    if (!fs.existsSync(path.join(runtime, relative))) throw new Error(`[vsix] missing packaged runtime: ${relative}`);
  }
  run(process.execPath, [path.join(runtime, "@mz80", "cli", "dist", "index.js"), "--help"], temp);
  console.log("[vsix] packaged LSP, CLI, DAP, and runtime dependencies are self-contained");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(archive, { force: true });
}

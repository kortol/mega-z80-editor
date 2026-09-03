const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

if (!process.env.CI && !process.env.MZ80_VERIFY_DIST_ISOLATED) {
  throw new Error("verify:dist must run in CI or an isolated worktree (set MZ80_VERIFY_DIST_ISOLATED=1 there)");
}
const root = path.resolve(__dirname, "..");
const managed = ["packages/core/dist", "packages/assembler/dist", "packages/c-compiler/dist", "packages/cli/dist", "editor/lsp/dist", "editor/vscode-ext/dist"];
for (const relative of managed) {
  // This command is intentionally restricted to explicitly enumerated generated
  // directories, and only runs in CI or a caller-provided isolated worktree.
  fs.rmSync(path.join(root, relative), { recursive: true, force: true });
}
execFileSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
execFileSync("git", ["diff", "--exit-code", "--", ...managed], { cwd: root, stdio: "inherit" });

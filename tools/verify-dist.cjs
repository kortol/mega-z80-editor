const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function gitOutput(args) {
  return execFileSync("git", args, { encoding: "utf8", cwd: path.resolve(__dirname, ".."), shell: process.platform === "win32" }).trim();
}

const isCi = Boolean(process.env.CI);
const gitDir = gitOutput(["rev-parse", "--git-dir"]);
const gitCommonDir = gitOutput(["rev-parse", "--git-common-dir"]);
const isLinkedWorktree = path.resolve(path.resolve(__dirname, ".."), gitDir) !== path.resolve(path.resolve(__dirname, ".."), gitCommonDir);
if (!isCi && !isLinkedWorktree) {
  throw new Error("verify:dist must run in CI or a linked isolated worktree; it will not delete generated output in the current checkout");
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

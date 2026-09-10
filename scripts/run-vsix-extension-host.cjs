const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extensionPackage = path.join(root, "editor", "vscode-ext");
const { runTests } = require(require.resolve("@vscode/test-electron", { paths: [extensionPackage] }));
const extensionDevelopmentPath = path.resolve(process.argv[2] ?? "");
if (!fs.existsSync(path.join(extensionDevelopmentPath, "package.json"))) {
  throw new Error("usage: node scripts/run-vsix-extension-host.cjs <extracted-extension-directory>");
}

function installedVsCode() {
  if (process.env.MZ80_VSCODE_EXECUTABLE) return process.env.MZ80_VSCODE_EXECUTABLE;
  if (process.platform !== "win32") return undefined;
  const localAppData = process.env.LOCALAPPDATA;
  const candidate = localAppData && path.join(localAppData, "Programs", "Microsoft VS Code", "Code.exe");
  return candidate && fs.existsSync(candidate) ? candidate : undefined;
}

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-vsix-host-"));
  const workspace = path.join(temporary, "workspace");
  const userData = path.join(temporary, "user-data");
  const extensions = path.join(temporary, "extensions");
  fs.mkdirSync(workspace);
  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath: path.join(root, "tools", "vsix-extension-host-test.cjs"),
      vscodeExecutablePath: installedVsCode(),
      launchArgs: [workspace, `--user-data-dir=${userData}`, `--extensions-dir=${extensions}`],
      extensionTestsEnv: { MZ80_VSIX_SMOKE_WORKSPACE: workspace },
    });
    console.log("[vsix] packaged extension host activates LSP and DAP runtime successfully");
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

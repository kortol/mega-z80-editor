import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type ToolMode = "host" | "wsl";

export type RunTool = (command: string, args: string[], cwd: string, toolMode: ToolMode) => void;

export function buildCppArgs(includeDirs: string[] = [], cppArgs: string[] = []): string[] {
  const args: string[] = [];
  for (const includeDir of includeDirs) {
    args.push(`-I${path.resolve(includeDir)}`);
  }
  return [...args, ...cppArgs];
}

export function prepareToolchainIncludeDirs(tempDir: string, toolMode: ToolMode, includeDirs: string[]): string[] {
  return toolMode === "wsl"
    ? prepareWslIncludeDirs(tempDir, includeDirs)
    : includeDirs;
}

export function findGeneratedSccAsm(stageDir: string, stem: string): string {
  const candidates = [
    path.join(stageDir, `${stem}.asm`),
    path.join(stageDir, `${stem}.ASM`),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const allAsmFiles = fs.readdirSync(stageDir)
    .filter((entry) => /\.asm$/i.test(entry))
    .map((entry) => path.join(stageDir, entry));
  if (allAsmFiles.length === 1) return allAsmFiles[0];
  throw new Error(`Could not find SCC asm output in ${stageDir}`);
}

export const defaultRunTool: RunTool = (command, args, cwd, toolMode) => {
  const hostNeedsShell = toolMode === "host" && /\.(cmd|bat)$/i.test(command);
  const result = toolMode === "wsl"
    ? spawnSync("wsl", buildWslArgs(command, args, cwd), {
      stdio: "pipe",
      encoding: "utf8",
    })
    : spawnSync(command, args, {
      cwd,
      stdio: "pipe",
      encoding: "utf8",
      shell: hostNeedsShell,
    });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    const stdout = (result.stdout ?? "").trim();
    throw new Error(
      [command, ...args].join(" ")
      + (stderr ? ` failed: ${stderr}` : stdout ? ` failed: ${stdout}` : " failed"),
    );
  }
};

export function safeRmDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // best effort cleanup only
  }
}

function prepareWslIncludeDirs(tempDir: string, includeDirs: string[]): string[] {
  if (includeDirs.length === 0) return includeDirs;
  const shadowRoot = path.join(tempDir, "_include_shadow");
  fs.mkdirSync(shadowRoot, { recursive: true });
  const ordered: string[] = [];
  for (const includeDir of includeDirs) {
    const resolved = path.resolve(includeDir);
    const shadowDir = path.join(shadowRoot, path.basename(resolved).toLowerCase());
    fs.rmSync(shadowDir, { recursive: true, force: true });
    fs.mkdirSync(shadowDir, { recursive: true });
    for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const src = path.join(resolved, entry.name);
      fs.copyFileSync(src, path.join(shadowDir, entry.name.toLowerCase()));
    }
    ordered.push(shadowDir, resolved);
  }
  return ordered;
}

function buildWslArgs(command: string, args: string[], cwd: string): string[] {
  const linuxCwd = toWslPath(cwd);
  const linuxArgs = args.map((arg) => maybeToWslPath(arg));
  const shellCommand = [command, ...linuxArgs].map(shellQuote).join(" ");
  return ["bash", "-lc", `cd ${shellQuote(linuxCwd)} && ${shellCommand}`];
}

function maybeToWslPath(value: string): string {
  if (/^-I[A-Za-z]:[\\/]/.test(value)) {
    return `-I${toWslPath(value.slice(2))}`;
  }
  if (/^[A-Za-z]:[\\/]/.test(value)) {
    return toWslPath(value);
  }
  return value;
}

function toWslPath(winPath: string): string {
  const normalized = path.resolve(winPath).replace(/\\/g, "/");
  const drive = normalized[0]?.toLowerCase();
  if (!drive || normalized[1] !== ":") {
    return normalized;
  }
  return `/mnt/${drive}${normalized.slice(2)}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

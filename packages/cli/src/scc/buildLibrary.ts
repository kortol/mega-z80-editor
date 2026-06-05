import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assemble } from "../cli/mz80-as";
import { createArchive } from "../linker/archive";
import { Logger } from "../logger";
import { translateSccAsm } from "./translateAsm";

type ToolMode = "host" | "wsl";
type RunTool = (command: string, args: string[], cwd: string, toolMode: ToolMode) => void;
type AssembleFile = typeof assemble;
type ArchiveFiles = typeof createArchive;

export type BuildSccLibraryOptions = {
  outputFile: string;
  inputFiles: string[];
  includeDirs?: string[];
  cppArgs?: string[];
  sccArgs?: string[];
  dcppPath?: string;
  sccz80Path?: string;
  tempDir?: string;
  keepTemps?: boolean;
  verbose?: boolean;
  toolMode?: ToolMode;
};

type BuildDeps = {
  runTool?: RunTool;
  assembleFile?: AssembleFile;
  archiveFiles?: ArchiveFiles;
};

export function buildSccLibrary(
  logger: Logger,
  opts: BuildSccLibraryOptions,
  deps: BuildDeps = {},
): { archivePath: string; relFiles: string[]; tempDir: string } {
  const runTool = deps.runTool ?? defaultRunTool;
  const assembleFile = deps.assembleFile ?? assemble;
  const archiveFiles = deps.archiveFiles ?? createArchive;
  const tempDir = opts.tempDir
    ? path.resolve(opts.tempDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), "mz80-scc-lib-"));

  fs.mkdirSync(tempDir, { recursive: true });

  const relFiles: string[] = [];
  const toolMode = opts.toolMode ?? "host";
  const includeDirs = toolMode === "wsl"
    ? prepareWslIncludeDirs(tempDir, opts.includeDirs ?? [])
    : (opts.includeDirs ?? []);
  try {
    for (const inputFile of opts.inputFiles) {
      const resolvedInput = path.resolve(inputFile);
      const stem = path.basename(resolvedInput, path.extname(resolvedInput)).toLowerCase();
      const stageDir = path.join(tempDir, stem);
      fs.mkdirSync(stageDir, { recursive: true });

      const prePath = path.join(stageDir, `${stem}.i`);
      const preArg = toolMode === "wsl" ? path.basename(prePath) : prePath;
      const sccAsmPath = path.join(stageDir, `${stem}.scc.asm`);
      const mz80AsmPath = path.join(stageDir, `${stem}.asm`);
      const relPath = path.join(stageDir, `${stem}.rel`);

      runTool(
        opts.dcppPath ?? "dcpp",
        [...buildCppArgs(includeDirs, opts.cppArgs), resolvedInput, preArg],
        stageDir,
        toolMode,
      );

      runTool(
        opts.sccz80Path ?? "sccz80",
        [...(opts.sccArgs ?? []), preArg],
        stageDir,
        toolMode,
      );

      const generatedAsmPath = findGeneratedSccAsm(stageDir, stem);
      fs.copyFileSync(generatedAsmPath, sccAsmPath);

      const translated = translateSccAsm(fs.readFileSync(sccAsmPath, "utf8"), {
        moduleName: path.basename(sccAsmPath),
      });
      fs.writeFileSync(mz80AsmPath, translated, "utf8");

      const ctx = assembleFile(logger, mz80AsmPath, relPath, { relVersion: 2, verbose: opts.verbose });
      if (ctx.errors.length > 0) {
        throw new Error(`Assembly failed for ${resolvedInput}: ${ctx.errors.map((e) => e.message).join("; ")}`);
      }
      relFiles.push(relPath);
    }

    const archivePath = path.resolve(opts.outputFile);
    archiveFiles(relFiles, archivePath);
    logger.info(`Built SCC library: ${archivePath}`);
    return { archivePath, relFiles, tempDir };
  } catch (error) {
    if (!opts.keepTemps && !opts.tempDir) {
      safeRmDir(tempDir);
    }
    throw error;
  }
}

function buildCppArgs(includeDirs: string[] = [], cppArgs: string[] = []): string[] {
  const args: string[] = [];
  for (const includeDir of includeDirs) {
    args.push(`-I${path.resolve(includeDir)}`);
  }
  return [...args, ...cppArgs];
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

function findGeneratedSccAsm(stageDir: string, stem: string): string {
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

function defaultRunTool(command: string, args: string[], cwd: string, toolMode: ToolMode): void {
  const result = toolMode === "wsl"
    ? spawnSync("wsl", buildWslArgs(command, args, cwd), {
      stdio: "pipe",
      encoding: "utf8",
    })
    : spawnSync(command, args, {
      cwd,
      stdio: "pipe",
      encoding: "utf8",
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

function safeRmDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // best effort cleanup only
  }
}

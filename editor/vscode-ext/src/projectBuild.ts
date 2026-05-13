import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import * as vscode from "vscode";
import { Mz80AsOptions, Mz80LinkOptions, ResolvedTargetConfig } from "./projectConfig";

type RunCliOptions = {
  workspaceRoot: string;
  cliEntry: string;
  output: vscode.OutputChannel;
};

export async function buildTarget(
  target: ResolvedTargetConfig,
  options: RunCliOptions,
): Promise<void> {
  for (const moduleEntry of target.modules) {
    fs.mkdirSync(path.dirname(moduleEntry.object), { recursive: true });
    const args = [
      options.cliEntry,
      "as",
      moduleEntry.source,
      moduleEntry.object,
      ...buildAssemblerArgs(target.as, options.workspaceRoot),
    ];
    await runCli(args, options, `[as] ${path.basename(moduleEntry.source)}`);
  }

  fs.mkdirSync(path.dirname(target.output), { recursive: true });
  const linkArgs = [
    options.cliEntry,
    "link",
    target.output,
    ...target.modules.map((entry) => entry.object),
    ...buildLinkArgs(target.link),
  ];
  await runCli(linkArgs, options, `[link] ${path.basename(target.output)}`);
}

export function toLaunchConfiguration(target: ResolvedTargetConfig): vscode.DebugConfiguration {
  const link = target.link ?? {};
  const debug = target.debug ?? {};
  const program = target.output;
  const baseName = program.replace(/\.[^.]+$/, "");
  return {
    type: "mz80-dap",
    name: `MZ80 Launch (${target.name})`,
    request: "launch",
    program,
    sym: link.sym ? `${baseName}.sym` : undefined,
    smap: link.smap ? `${baseName}.smap` : undefined,
    cpm: debug.cpm ?? link.com ?? /\.com$/i.test(program),
    cpmInteractive: debug.cpmInteractive ?? (debug.cpm ?? link.com ?? /\.com$/i.test(program)),
    base: debug.base,
    rpcListen: debug.rpcListen,
  };
}

function buildAssemblerArgs(options: Mz80AsOptions | undefined, workspaceRoot: string): string[] {
  if (!options) return [];
  const args: string[] = [];
  if (options.relVersion !== undefined) args.push("--rel-version", String(options.relVersion));
  if (options.sym) args.push("--sym");
  if (options.lst) args.push("--lst");
  if (options.smap) args.push("--smap");
  if (options.sjasmCompat) args.push("--sjasm-compat");
  if (options.symLen !== undefined) args.push("--symlen", String(options.symLen));
  for (const includePath of options.includePaths ?? []) {
    args.push("--include", path.resolve(workspaceRoot, includePath));
  }
  return args;
}

function buildLinkArgs(options: Mz80LinkOptions | undefined): string[] {
  if (!options) return [];
  const args: string[] = [];
  if (options.map) args.push("--map");
  if (options.sym) args.push("--sym");
  if (options.smap) args.push("--smap");
  if (options.log) args.push("--log");
  if (options.com) args.push("--com");
  if (options.binFrom !== undefined) args.push("--bin-from", String(options.binFrom));
  if (options.binTo !== undefined) args.push("--bin-to", String(options.binTo));
  if (options.orgText !== undefined) args.push("--org-text", String(options.orgText));
  if (options.orgData !== undefined) args.push("--org-data", String(options.orgData));
  if (options.orgBss !== undefined) args.push("--org-bss", String(options.orgBss));
  if (options.orgCustom !== undefined) args.push("--org-custom", String(options.orgCustom));
  if (options.fullpath !== undefined) args.push("--fullpath", String(options.fullpath));
  return args;
}

function runCli(args: string[], options: RunCliOptions, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    options.output.appendLine(`${label}: node ${args.join(" ")}`);
    const child = spawn("node", args, {
      cwd: options.workspaceRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => options.output.append(chunk.toString()));
    child.stderr.on("data", (chunk) => options.output.append(chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with exit code ${code ?? "?"}`));
    });
  });
}

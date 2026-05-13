import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { Mz80ProjectFile, ResolvedTargetConfig, resolveTarget } from "./projectConfig";
import { toLaunchConfiguration } from "./projectBuild";

type LaunchJson = {
  version: "0.2.0";
  configurations: vscode.DebugConfiguration[];
};

export function generateLaunchJson(
  workspaceRoot: string,
  projectRoot: string,
  project: Mz80ProjectFile,
): LaunchJson {
  const configurations: vscode.DebugConfiguration[] = [];
  const targetNames = project.targets ? Object.keys(project.targets) : [];

  for (const targetName of targetNames) {
    const target = resolveTarget(projectRoot, project, targetName);
    if (!target) continue;
    configurations.push(makeTargetLaunch(workspaceRoot, projectRoot, target));
    configurations.push(makeProgramLaunch(workspaceRoot, projectRoot, target));
  }

  configurations.push({
    name: "MZ80 Attach (RPC 4700)",
    type: "mz80-dap",
    request: "attach",
    connect: "127.0.0.1:4700",
    cwd: toWorkspacePath(workspaceRoot, projectRoot),
  });

  return {
    version: "0.2.0",
    configurations,
  };
}

export async function writeLaunchJson(workspaceRoot: string, launchJson: LaunchJson): Promise<string> {
  const vscodeDir = path.join(workspaceRoot, ".vscode");
  fs.mkdirSync(vscodeDir, { recursive: true });
  const launchPath = path.join(vscodeDir, "launch.json");
  fs.writeFileSync(launchPath, JSON.stringify(launchJson, null, 2));
  return launchPath;
}

function makeTargetLaunch(workspaceRoot: string, projectRoot: string, target: ResolvedTargetConfig): vscode.DebugConfiguration {
  return {
    name: `MZ80 Launch (${target.name} target)`,
    type: "mz80-dap",
    request: "launch",
    cwd: toWorkspacePath(workspaceRoot, projectRoot),
    target: target.name,
  };
}

function makeProgramLaunch(workspaceRoot: string, projectRoot: string, target: ResolvedTargetConfig): vscode.DebugConfiguration {
  const launch = toLaunchConfiguration(target);
  return {
    name: `MZ80 Launch (${path.basename(target.output)})`,
    type: "mz80-dap",
    request: "launch",
    cwd: toWorkspacePath(workspaceRoot, projectRoot),
    program: toWorkspacePath(workspaceRoot, target.output),
    sym: typeof launch.sym === "string" ? toWorkspacePath(workspaceRoot, launch.sym) : undefined,
    smap: typeof launch.smap === "string" ? toWorkspacePath(workspaceRoot, launch.smap) : undefined,
    cpm: launch.cpm,
    cpmInteractive: launch.cpmInteractive,
    base: launch.base,
    rpcListen: launch.rpcListen,
  };
}

function toWorkspacePath(workspaceRoot: string, filePath: string): string {
  const rel = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
  return rel.length > 0 ? `\${workspaceFolder}/${rel}` : "${workspaceFolder}";
}

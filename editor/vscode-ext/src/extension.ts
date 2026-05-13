import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from "vscode-languageclient/node";
import { importProjectFromSimpleMakefile } from "./makefileImport";
import { buildTarget, toLaunchConfiguration } from "./projectBuild";
import { generateLaunchJson, writeLaunchJson } from "./projectLaunch";
import { generateProjectFromFolders as scaffoldProjectFromFolders } from "./projectScaffold";
import {
  getProjectConfigPath,
  listTargetNames,
  loadProjectFile,
  PROJECT_CONFIG_FILE,
  resolveTarget,
  resolveTargetName,
  saveProjectFile,
  type Mz80ProjectFile,
} from "./projectConfig";

let client: LanguageClient;
let dapOutput: vscode.OutputChannel | undefined;
let buildOutput: vscode.OutputChannel | undefined;

type Mz80DebugConfiguration = vscode.DebugConfiguration & {
  request?: "launch" | "attach";
  program?: string;
  connect?: string;
  rpcListen?: string;
  cliEntry?: string;
  cwd?: string;
  sym?: string;
  smap?: string;
  base?: string;
  cpm?: boolean;
  cpmInteractive?: boolean;
  target?: string;
};

function findWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  return folders[0].uri.fsPath;
}

function findCurrentProjectRoot(): string | undefined {
  const activeDoc = vscode.window.activeTextEditor?.document;
  if (activeDoc?.uri.scheme === "file") {
    const folder = vscode.workspace.getWorkspaceFolder(activeDoc.uri);
    if (folder) {
      const workspaceRoot = folder.uri.fsPath;
      let current = path.dirname(activeDoc.uri.fsPath);
      while (current.startsWith(workspaceRoot)) {
        if (looksLikeProjectRoot(current)) return current;
        if (current === workspaceRoot) break;
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
      return workspaceRoot;
    }
  }
  return findWorkspaceRoot();
}

function looksLikeProjectRoot(dir: string): boolean {
  if (fs.existsSync(path.join(dir, "src")) && fs.statSync(path.join(dir, "src")).isDirectory()) {
    return true;
  }
  for (const name of ["mz80.yaml", "Makefile", "makefile", "GNUmakefile"]) {
    if (fs.existsSync(path.join(dir, name))) return true;
  }
  return false;
}

function resolveBundledCliEntryPath(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, "server", "packages", "cli", "dist", "index.js");
}

function resolveBundledLspEntryPath(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, "server", "lsp", "dist", "index.js");
}

function resolveCliEntryPath(cfg: Mz80DebugConfiguration, context: vscode.ExtensionContext): string {
  if (typeof cfg.cliEntry === "string" && cfg.cliEntry.trim().length > 0) {
    return cfg.cliEntry;
  }
  const configured = vscode.workspace.getConfiguration("mz80").get<string>("debug.cliEntry");
  if (configured && configured.trim().length > 0) return configured;

  const bundled = resolveBundledCliEntryPath(context);
  if (fs.existsSync(bundled)) return bundled;

  const wsRoot = findWorkspaceRoot();
  if (wsRoot) {
    const fromWorkspace = path.join(wsRoot, "packages", "cli", "dist", "index.js");
    if (fs.existsSync(fromWorkspace)) return fromWorkspace;
  }

  return path.resolve(context.extensionPath, "..", "..", "packages", "cli", "dist", "index.js");
}

function guessSidecarFile(programPath: string, ext: ".sym" | ".smap"): string | undefined {
  const dir = path.dirname(programPath);
  const base = path.basename(programPath).replace(/\.[^.]+$/, "");
  const candidate = path.join(dir, `${base}${ext}`);
  return fs.existsSync(candidate) ? candidate : undefined;
}

function logDap(message: string): void {
  dapOutput?.appendLine(message);
}

function asRecord(v: unknown): Record<string, unknown> {
  return (v && typeof v === "object") ? (v as Record<string, unknown>) : {};
}

export function activate(context: vscode.ExtensionContext) {
  dapOutput = vscode.window.createOutputChannel("MZ80 Debug");
  context.subscriptions.push(dapOutput);
  buildOutput = vscode.window.createOutputChannel("MZ80 Build");
  context.subscriptions.push(buildOutput);
  logDap("[ext] activate");
  const activeDoc = vscode.window.activeTextEditor?.document;
  if (activeDoc) {
    logDap(`[editor] active file=${activeDoc.uri.fsPath} lang=${activeDoc.languageId}`);
  }

  const serverModule = resolveBundledLspEntryPath(context);
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: { execArgv: ["--nolazy", "--inspect=6009"] }
    }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "z80-asm" }],
    outputChannelName: "MZ80 Language Server",
  };

  client = new LanguageClient("mz80Lsp", "MZ80 LSP", serverOptions, clientOptions);
  client.start();
  context.subscriptions.push(client);

  context.subscriptions.push(
    vscode.commands.registerCommand("mz80.runMake", () => {
      void buildDefaultTarget(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mz80.generateProjectFromMakefile", () => {
      void generateProjectFromMakefile();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mz80.generateProjectFromFolders", () => {
      void generateProjectFromFolders();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mz80.generateLaunchJsonFromProject", () => {
      void generateLaunchJsonFromProject();
    })
  );

  const configProvider: vscode.DebugConfigurationProvider = {
    resolveDebugConfiguration(
      _folder: vscode.WorkspaceFolder | undefined,
      config: Mz80DebugConfiguration
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
      const active = vscode.window.activeTextEditor;
      if (!config.type && !config.request && !config.name) {
        config.type = "mz80-dap";
        config.name = "MZ80 Launch";
        config.request = "launch";
        if (active?.document?.languageId === "z80-asm") {
          config.program = active.document.fileName;
        }
      }

      if (config.type !== "mz80-dap") return config;

      config.request = config.request ?? "launch";
      config.cliEntry = resolveCliEntryPath(config, context);
      config.cwd = config.cwd ?? findCurrentProjectRoot();

      if (!fs.existsSync(config.cliEntry)) {
        void vscode.window.showErrorMessage(`mz80 cli not found: ${config.cliEntry}`);
        logDap(`[config] cli missing: ${config.cliEntry}`);
        return null;
      }

      if (config.request === "launch") {
        if ((!config.program || String(config.program).trim().length === 0) && config.cwd) {
          applyProjectTargetDefaults(config.cwd, config);
        }
        config.rpcListen = config.rpcListen ?? "127.0.0.1:4700";
        if ((!config.program || String(config.program).trim().length === 0) && !config.target) {
          void vscode.window.showErrorMessage("mz80 launch requires `program` (.com/.bin path).");
          logDap("[config] launch rejected: missing program");
          return null;
        }
        const launchProgram = typeof config.program === "string" && config.program.trim().length > 0
          ? config.program
          : undefined;
        if (launchProgram && /\.com$/i.test(launchProgram)) {
          config.cpm = config.cpm ?? true;
          config.cpmInteractive = config.cpmInteractive ?? true;
        }
        if (launchProgram) {
          config.smap = config.smap ?? guessSidecarFile(launchProgram, ".smap");
          config.sym = config.sym ?? guessSidecarFile(launchProgram, ".sym");
        }
        logDap(`[config] launch program=${config.program} smap=${config.smap ?? "(none)"} sym=${config.sym ?? "(none)"} rpcListen=${config.rpcListen} cpm=${config.cpm ? "on" : "off"} cpmInteractive=${config.cpmInteractive ? "on" : "off"}`);
      } else if (config.request === "attach") {
        config.connect = config.connect ?? "127.0.0.1:4700";
        if (!config.connect || String(config.connect).trim().length === 0) {
          void vscode.window.showErrorMessage("mz80 attach requires `connect` (host:port).");
          logDap("[config] attach rejected: missing connect");
          return null;
        }
        logDap(`[config] attach connect=${config.connect}`);
      }

      return config;
    },
    resolveDebugConfigurationWithSubstitutedVariables(
      _folder: vscode.WorkspaceFolder | undefined,
      config: Mz80DebugConfiguration
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
      if (config.type === "mz80-dap" && config.request === "launch") {
        if ((!config.program || String(config.program).trim().length === 0) && config.cwd) {
          applyProjectTargetDefaults(config.cwd, config);
        }
        if (!config.program || String(config.program).trim().length === 0) {
          void vscode.window.showErrorMessage("mz80 launch requires `program` (.com/.bin path).");
          logDap("[config/subst] launch rejected: missing program");
          return null;
        }
        if (typeof config.program === "string" && config.program.trim().length > 0) {
          config.smap = config.smap ?? guessSidecarFile(config.program, ".smap");
          config.sym = config.sym ?? guessSidecarFile(config.program, ".sym");
          logDap(`[config/subst] program=${config.program} smap=${config.smap ?? "(none)"} sym=${config.sym ?? "(none)"}`);
        }
      }
      return config;
    },
  };

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider("mz80-dap", configProvider)
  );

  const descriptorFactory: vscode.DebugAdapterDescriptorFactory = {
    createDebugAdapterDescriptor(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
      const cfg = session.configuration as Mz80DebugConfiguration;
      const cliEntry = resolveCliEntryPath(cfg, context);
      if (!fs.existsSync(cliEntry)) {
        void vscode.window.showErrorMessage(`mz80 cli not found: ${cliEntry}`);
        logDap(`[descriptor] cli missing: ${cliEntry}`);
        return undefined;
      }
      logDap(`[descriptor] start adapter runtime=node cli=${cliEntry} cwd=${cfg.cwd ?? findCurrentProjectRoot()}`);
      return new vscode.DebugAdapterExecutable(
        "node",
        [cliEntry, "dap"],
        { cwd: cfg.cwd ?? findCurrentProjectRoot() }
      );
    },
  };

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory("mz80-dap", descriptorFactory)
  );

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory("mz80-dap", {
      createDebugAdapterTracker: (_session) => ({
        onWillReceiveMessage: (message: unknown) => {
          const m = asRecord(message);
          const cmd = typeof m.command === "string" ? m.command : "";
          if (cmd === "setBreakpoints" || cmd === "launch" || cmd === "attach" || cmd === "continue" || cmd === "next") {
            logDap(`[tracker->dap] ${cmd}`);
          }
        },
        onDidSendMessage: (message: unknown) => {
          const m = asRecord(message);
          const kind = typeof m.type === "string" ? m.type : "";
          if (kind === "event") {
            const ev = typeof m.event === "string" ? m.event : "";
            if (ev === "output" || ev === "stopped" || ev === "initialized" || ev === "terminated") {
              logDap(`[tracker<-dap] event:${ev}`);
            }
            return;
          }
          if (kind === "response") {
            const cmd = typeof m.command === "string" ? m.command : "";
            if (cmd === "setBreakpoints" || cmd === "launch" || cmd === "attach" || cmd === "continue" || cmd === "next") {
              const success = m.success === true ? "ok" : "ng";
              logDap(`[tracker<-dap] response:${cmd} ${success}`);
            }
          }
        },
        onError: (error: Error) => {
          logDap(`[tracker] error: ${error.message}`);
        },
        onExit: (code: number | undefined, signal: string | undefined) => {
          logDap(`[tracker] exit code=${code ?? "?"} signal=${signal ?? "-"}`);
        },
      }),
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidChangeBreakpoints((e) => {
      for (const bp of e.added) {
        if (bp instanceof vscode.SourceBreakpoint) {
          logDap(`[bp] added ${bp.location.uri.fsPath}:${bp.location.range.start.line + 1}`);
        }
      }
      for (const bp of e.changed) {
        if (bp instanceof vscode.SourceBreakpoint) {
          logDap(`[bp] changed ${bp.location.uri.fsPath}:${bp.location.range.start.line + 1}`);
        }
      }
      for (const bp of e.removed) {
        if (bp instanceof vscode.SourceBreakpoint) {
          logDap(`[bp] removed ${bp.location.uri.fsPath}:${bp.location.range.start.line + 1}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) return;
      logDap(`[editor] active file=${editor.document.uri.fsPath} lang=${editor.document.languageId}`);
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

function applyProjectTargetDefaults(workspaceRoot: string, config: Mz80DebugConfiguration): void {
  const project = loadProjectFile(workspaceRoot);
  const targetName = resolveTargetName(project, config.target);
  if (!project || !targetName) return;
  const target = resolveTarget(workspaceRoot, project, targetName);
  if (!target) return;
  const launch = toLaunchConfiguration(target);
  config.target = config.target ?? targetName;
  config.program = config.program ?? launch.program;
  config.sym = config.sym ?? launch.sym;
  config.smap = config.smap ?? launch.smap;
  config.base = config.base ?? launch.base;
  config.cpm = config.cpm ?? launch.cpm;
  config.cpmInteractive = config.cpmInteractive ?? launch.cpmInteractive;
  config.rpcListen = config.rpcListen ?? launch.rpcListen;
  logDap(`[project] target=${targetName} program=${config.program}`);
}

async function buildDefaultTarget(context: vscode.ExtensionContext): Promise<void> {
  const workspaceRoot = findCurrentProjectRoot();
  if (!workspaceRoot) {
    void vscode.window.showErrorMessage("Open a workspace folder first.");
    return;
  }
  let project = loadProjectFile(workspaceRoot);
  if (!project || listTargetNames(project).length === 0) {
    const imported = await maybeGenerateProject(workspaceRoot);
    if (!imported) return;
    project = imported;
  }
  const targetName = await pickTargetName(project);
  if (!targetName) return;
  const target = resolveTarget(workspaceRoot, project, targetName);
  if (!target) {
    void vscode.window.showErrorMessage(`Unknown target: ${targetName}`);
    return;
  }
  const cliEntry = resolveCliEntryPath({ type: "mz80-dap", name: "mz80 build", request: "launch" }, context);
  if (!fs.existsSync(cliEntry)) {
    void vscode.window.showErrorMessage(`mz80 cli not found: ${cliEntry}`);
    return;
  }
  buildOutput?.show(true);
  buildOutput?.appendLine(`[build] target=${targetName}`);
  try {
    await buildTarget(target, {
      workspaceRoot,
      cliEntry,
      output: buildOutput!,
    });
    void vscode.window.showInformationMessage(`mz80: built target '${targetName}'`);
  } catch (err: any) {
    void vscode.window.showErrorMessage(`mz80 build failed: ${err?.message ?? err}`);
  }
}

async function generateProjectFromMakefile(): Promise<void> {
  const workspaceRoot = findCurrentProjectRoot();
  if (!workspaceRoot) {
    void vscode.window.showErrorMessage("Open a workspace folder first.");
    return;
  }
  try {
    const existing = loadProjectFile(workspaceRoot);
    const imported = importProjectFromSimpleMakefile(workspaceRoot, existing);
    saveProjectFile(workspaceRoot, imported.config);
    const doc = await vscode.workspace.openTextDocument(getProjectConfigPath(workspaceRoot));
    await vscode.window.showTextDocument(doc);
    void vscode.window.showInformationMessage(`Generated ${PROJECT_CONFIG_FILE} from ${path.basename(imported.makefilePath)}`);
  } catch (err: any) {
    void vscode.window.showErrorMessage(`mz80 project import failed: ${err?.message ?? err}`);
  }
}

async function generateProjectFromFolders(): Promise<void> {
  const workspaceRoot = findCurrentProjectRoot();
  if (!workspaceRoot) {
    void vscode.window.showErrorMessage("Open a workspace folder first.");
    return;
  }
  try {
    const existing = loadProjectFile(workspaceRoot);
    const project = scaffoldProjectFromFolders(workspaceRoot, existing);
    saveProjectFile(workspaceRoot, project);
    const doc = await vscode.workspace.openTextDocument(getProjectConfigPath(workspaceRoot));
    await vscode.window.showTextDocument(doc);
    void vscode.window.showInformationMessage(`Generated ${PROJECT_CONFIG_FILE} from src/ and build/ folder conventions`);
  } catch (err: any) {
    void vscode.window.showErrorMessage(`mz80 project scaffold failed: ${err?.message ?? err}`);
  }
}

async function generateLaunchJsonFromProject(): Promise<void> {
  const projectRoot = findCurrentProjectRoot();
  const workspaceRoot = findWorkspaceRoot();
  if (!projectRoot || !workspaceRoot) {
    void vscode.window.showErrorMessage("Open a workspace folder first.");
    return;
  }
  const project = loadProjectFile(projectRoot);
  if (!project || listTargetNames(project).length === 0) {
    void vscode.window.showErrorMessage(`No targets found in ${PROJECT_CONFIG_FILE}.`);
    return;
  }
  try {
    const launchJson = generateLaunchJson(workspaceRoot, projectRoot, project);
    const launchPath = await writeLaunchJson(workspaceRoot, launchJson);
    const doc = await vscode.workspace.openTextDocument(launchPath);
    await vscode.window.showTextDocument(doc);
    void vscode.window.showInformationMessage(`Generated ${path.relative(workspaceRoot, launchPath)} from ${PROJECT_CONFIG_FILE}`);
  } catch (err: any) {
    void vscode.window.showErrorMessage(`mz80 launch.json generation failed: ${err?.message ?? err}`);
  }
}

async function maybeGenerateProject(workspaceRoot: string): Promise<Mz80ProjectFile | undefined> {
  const choice = await vscode.window.showInformationMessage(
    `No ${PROJECT_CONFIG_FILE} target configuration was found. Generate it from a simple Makefile?`,
    "Generate",
    "Cancel",
  );
  if (choice !== "Generate") return undefined;
  try {
    const existing = loadProjectFile(workspaceRoot);
    const imported = importProjectFromSimpleMakefile(workspaceRoot, existing);
    saveProjectFile(workspaceRoot, imported.config);
    const doc = await vscode.workspace.openTextDocument(getProjectConfigPath(workspaceRoot));
    await vscode.window.showTextDocument(doc);
    return imported.config;
  } catch (err: any) {
    void vscode.window.showErrorMessage(`mz80 project import failed: ${err?.message ?? err}`);
    return undefined;
  }
}

async function pickTargetName(project: Mz80ProjectFile): Promise<string | undefined> {
  const names = listTargetNames(project);
  if (names.length === 0) return undefined;
  if (names.length === 1) return names[0];
  const defaultTarget = resolveTargetName(project);
  const picked = await vscode.window.showQuickPick(
    names.map((name) => ({
      label: name,
      description: name === defaultTarget ? "default" : "",
    })),
    { placeHolder: "Select mz80 target" },
  );
  return picked?.label;
}

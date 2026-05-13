"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const node_1 = require("vscode-languageclient/node");
const makefileImport_1 = require("./makefileImport");
const projectBuild_1 = require("./projectBuild");
const projectLaunch_1 = require("./projectLaunch");
const projectScaffold_1 = require("./projectScaffold");
const projectConfig_1 = require("./projectConfig");
let client;
let dapOutput;
let buildOutput;
function findWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0)
        return undefined;
    return folders[0].uri.fsPath;
}
function findCurrentProjectRoot() {
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (activeDoc?.uri.scheme === "file") {
        const folder = vscode.workspace.getWorkspaceFolder(activeDoc.uri);
        if (folder) {
            const workspaceRoot = folder.uri.fsPath;
            let current = path.dirname(activeDoc.uri.fsPath);
            while (current.startsWith(workspaceRoot)) {
                if (looksLikeProjectRoot(current))
                    return current;
                if (current === workspaceRoot)
                    break;
                const parent = path.dirname(current);
                if (parent === current)
                    break;
                current = parent;
            }
            return workspaceRoot;
        }
    }
    return findWorkspaceRoot();
}
function looksLikeProjectRoot(dir) {
    if (fs.existsSync(path.join(dir, "src")) && fs.statSync(path.join(dir, "src")).isDirectory()) {
        return true;
    }
    for (const name of ["mz80.yaml", "Makefile", "makefile", "GNUmakefile"]) {
        if (fs.existsSync(path.join(dir, name)))
            return true;
    }
    return false;
}
function resolveBundledCliEntryPath(context) {
    return path.join(context.extensionPath, "server", "packages", "cli", "dist", "index.js");
}
function resolveBundledLspEntryPath(context) {
    return path.join(context.extensionPath, "server", "lsp", "dist", "index.js");
}
function resolveCliEntryPath(cfg, context) {
    if (typeof cfg.cliEntry === "string" && cfg.cliEntry.trim().length > 0) {
        return cfg.cliEntry;
    }
    const configured = vscode.workspace.getConfiguration("mz80").get("debug.cliEntry");
    if (configured && configured.trim().length > 0)
        return configured;
    const bundled = resolveBundledCliEntryPath(context);
    if (fs.existsSync(bundled))
        return bundled;
    const wsRoot = findWorkspaceRoot();
    if (wsRoot) {
        const fromWorkspace = path.join(wsRoot, "packages", "cli", "dist", "index.js");
        if (fs.existsSync(fromWorkspace))
            return fromWorkspace;
    }
    return path.resolve(context.extensionPath, "..", "..", "packages", "cli", "dist", "index.js");
}
function guessSidecarFile(programPath, ext) {
    const dir = path.dirname(programPath);
    const base = path.basename(programPath).replace(/\.[^.]+$/, "");
    const candidate = path.join(dir, `${base}${ext}`);
    return fs.existsSync(candidate) ? candidate : undefined;
}
function logDap(message) {
    dapOutput?.appendLine(message);
}
function asRecord(v) {
    return (v && typeof v === "object") ? v : {};
}
function activate(context) {
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
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.stdio },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.stdio,
            options: { execArgv: ["--nolazy", "--inspect=6009"] }
        }
    };
    const clientOptions = {
        documentSelector: [{ scheme: "file", language: "z80-asm" }],
        outputChannelName: "MZ80 Language Server",
    };
    client = new node_1.LanguageClient("mz80Lsp", "MZ80 LSP", serverOptions, clientOptions);
    client.start();
    context.subscriptions.push(client);
    context.subscriptions.push(vscode.commands.registerCommand("mz80.runMake", () => {
        void buildDefaultTarget(context);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("mz80.generateProjectFromMakefile", () => {
        void generateProjectFromMakefile();
    }));
    context.subscriptions.push(vscode.commands.registerCommand("mz80.generateProjectFromFolders", () => {
        void generateProjectFromFolders();
    }));
    context.subscriptions.push(vscode.commands.registerCommand("mz80.generateLaunchJsonFromProject", () => {
        void generateLaunchJsonFromProject();
    }));
    const configProvider = {
        resolveDebugConfiguration(_folder, config) {
            const active = vscode.window.activeTextEditor;
            if (!config.type && !config.request && !config.name) {
                config.type = "mz80-dap";
                config.name = "MZ80 Launch";
                config.request = "launch";
                if (active?.document?.languageId === "z80-asm") {
                    config.program = active.document.fileName;
                }
            }
            if (config.type !== "mz80-dap")
                return config;
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
            }
            else if (config.request === "attach") {
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
        resolveDebugConfigurationWithSubstitutedVariables(_folder, config) {
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
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("mz80-dap", configProvider));
    const descriptorFactory = {
        createDebugAdapterDescriptor(session) {
            const cfg = session.configuration;
            const cliEntry = resolveCliEntryPath(cfg, context);
            if (!fs.existsSync(cliEntry)) {
                void vscode.window.showErrorMessage(`mz80 cli not found: ${cliEntry}`);
                logDap(`[descriptor] cli missing: ${cliEntry}`);
                return undefined;
            }
            logDap(`[descriptor] start adapter runtime=node cli=${cliEntry} cwd=${cfg.cwd ?? findCurrentProjectRoot()}`);
            return new vscode.DebugAdapterExecutable("node", [cliEntry, "dap"], { cwd: cfg.cwd ?? findCurrentProjectRoot() });
        },
    };
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory("mz80-dap", descriptorFactory));
    context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory("mz80-dap", {
        createDebugAdapterTracker: (_session) => ({
            onWillReceiveMessage: (message) => {
                const m = asRecord(message);
                const cmd = typeof m.command === "string" ? m.command : "";
                if (cmd === "setBreakpoints" || cmd === "launch" || cmd === "attach" || cmd === "continue" || cmd === "next") {
                    logDap(`[tracker->dap] ${cmd}`);
                }
            },
            onDidSendMessage: (message) => {
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
            onError: (error) => {
                logDap(`[tracker] error: ${error.message}`);
            },
            onExit: (code, signal) => {
                logDap(`[tracker] exit code=${code ?? "?"} signal=${signal ?? "-"}`);
            },
        }),
    }));
    context.subscriptions.push(vscode.debug.onDidChangeBreakpoints((e) => {
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
    }));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor)
            return;
        logDap(`[editor] active file=${editor.document.uri.fsPath} lang=${editor.document.languageId}`);
    }));
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
function applyProjectTargetDefaults(workspaceRoot, config) {
    const project = (0, projectConfig_1.loadProjectFile)(workspaceRoot);
    const targetName = (0, projectConfig_1.resolveTargetName)(project, config.target);
    if (!project || !targetName)
        return;
    const target = (0, projectConfig_1.resolveTarget)(workspaceRoot, project, targetName);
    if (!target)
        return;
    const launch = (0, projectBuild_1.toLaunchConfiguration)(target);
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
async function buildDefaultTarget(context) {
    const workspaceRoot = findCurrentProjectRoot();
    if (!workspaceRoot) {
        void vscode.window.showErrorMessage("Open a workspace folder first.");
        return;
    }
    let project = (0, projectConfig_1.loadProjectFile)(workspaceRoot);
    if (!project || (0, projectConfig_1.listTargetNames)(project).length === 0) {
        const imported = await maybeGenerateProject(workspaceRoot);
        if (!imported)
            return;
        project = imported;
    }
    const targetName = await pickTargetName(project);
    if (!targetName)
        return;
    const target = (0, projectConfig_1.resolveTarget)(workspaceRoot, project, targetName);
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
        await (0, projectBuild_1.buildTarget)(target, {
            workspaceRoot,
            cliEntry,
            output: buildOutput,
        });
        void vscode.window.showInformationMessage(`mz80: built target '${targetName}'`);
    }
    catch (err) {
        void vscode.window.showErrorMessage(`mz80 build failed: ${err?.message ?? err}`);
    }
}
async function generateProjectFromMakefile() {
    const workspaceRoot = findCurrentProjectRoot();
    if (!workspaceRoot) {
        void vscode.window.showErrorMessage("Open a workspace folder first.");
        return;
    }
    try {
        const existing = (0, projectConfig_1.loadProjectFile)(workspaceRoot);
        const imported = (0, makefileImport_1.importProjectFromSimpleMakefile)(workspaceRoot, existing);
        (0, projectConfig_1.saveProjectFile)(workspaceRoot, imported.config);
        const doc = await vscode.workspace.openTextDocument((0, projectConfig_1.getProjectConfigPath)(workspaceRoot));
        await vscode.window.showTextDocument(doc);
        void vscode.window.showInformationMessage(`Generated ${projectConfig_1.PROJECT_CONFIG_FILE} from ${path.basename(imported.makefilePath)}`);
    }
    catch (err) {
        void vscode.window.showErrorMessage(`mz80 project import failed: ${err?.message ?? err}`);
    }
}
async function generateProjectFromFolders() {
    const workspaceRoot = findCurrentProjectRoot();
    if (!workspaceRoot) {
        void vscode.window.showErrorMessage("Open a workspace folder first.");
        return;
    }
    try {
        const existing = (0, projectConfig_1.loadProjectFile)(workspaceRoot);
        const project = (0, projectScaffold_1.generateProjectFromFolders)(workspaceRoot, existing);
        (0, projectConfig_1.saveProjectFile)(workspaceRoot, project);
        const doc = await vscode.workspace.openTextDocument((0, projectConfig_1.getProjectConfigPath)(workspaceRoot));
        await vscode.window.showTextDocument(doc);
        void vscode.window.showInformationMessage(`Generated ${projectConfig_1.PROJECT_CONFIG_FILE} from src/ and build/ folder conventions`);
    }
    catch (err) {
        void vscode.window.showErrorMessage(`mz80 project scaffold failed: ${err?.message ?? err}`);
    }
}
async function generateLaunchJsonFromProject() {
    const projectRoot = findCurrentProjectRoot();
    const workspaceRoot = findWorkspaceRoot();
    if (!projectRoot || !workspaceRoot) {
        void vscode.window.showErrorMessage("Open a workspace folder first.");
        return;
    }
    const project = (0, projectConfig_1.loadProjectFile)(projectRoot);
    if (!project || (0, projectConfig_1.listTargetNames)(project).length === 0) {
        void vscode.window.showErrorMessage(`No targets found in ${projectConfig_1.PROJECT_CONFIG_FILE}.`);
        return;
    }
    try {
        const launchJson = (0, projectLaunch_1.generateLaunchJson)(workspaceRoot, projectRoot, project);
        const launchPath = await (0, projectLaunch_1.writeLaunchJson)(workspaceRoot, launchJson);
        const doc = await vscode.workspace.openTextDocument(launchPath);
        await vscode.window.showTextDocument(doc);
        void vscode.window.showInformationMessage(`Generated ${path.relative(workspaceRoot, launchPath)} from ${projectConfig_1.PROJECT_CONFIG_FILE}`);
    }
    catch (err) {
        void vscode.window.showErrorMessage(`mz80 launch.json generation failed: ${err?.message ?? err}`);
    }
}
async function maybeGenerateProject(workspaceRoot) {
    const choice = await vscode.window.showInformationMessage(`No ${projectConfig_1.PROJECT_CONFIG_FILE} target configuration was found. Generate it from a simple Makefile?`, "Generate", "Cancel");
    if (choice !== "Generate")
        return undefined;
    try {
        const existing = (0, projectConfig_1.loadProjectFile)(workspaceRoot);
        const imported = (0, makefileImport_1.importProjectFromSimpleMakefile)(workspaceRoot, existing);
        (0, projectConfig_1.saveProjectFile)(workspaceRoot, imported.config);
        const doc = await vscode.workspace.openTextDocument((0, projectConfig_1.getProjectConfigPath)(workspaceRoot));
        await vscode.window.showTextDocument(doc);
        return imported.config;
    }
    catch (err) {
        void vscode.window.showErrorMessage(`mz80 project import failed: ${err?.message ?? err}`);
        return undefined;
    }
}
async function pickTargetName(project) {
    const names = (0, projectConfig_1.listTargetNames)(project);
    if (names.length === 0)
        return undefined;
    if (names.length === 1)
        return names[0];
    const defaultTarget = (0, projectConfig_1.resolveTargetName)(project);
    const picked = await vscode.window.showQuickPick(names.map((name) => ({
        label: name,
        description: name === defaultTarget ? "default" : "",
    })), { placeHolder: "Select mz80 target" });
    return picked?.label;
}

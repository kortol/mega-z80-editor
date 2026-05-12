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
let client;
let dapOutput;
function findWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0)
        return undefined;
    return folders[0].uri.fsPath;
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
    // fallback for extension development from repository layout
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
    logDap("[ext] activate");
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (activeDoc) {
        logDap(`[editor] active file=${activeDoc.uri.fsPath} lang=${activeDoc.languageId}`);
    }
    // === LSPサーバ設定 ===
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
        outputChannelName: "MZ80 Language Server", // 👈 独自ログチャンネル
    };
    client = new node_1.LanguageClient("mz80Lsp", "MZ80 LSP", serverOptions, clientOptions);
    // === LSPクライアント開始 ===
    client.start();
    // `client` 自体は Disposable を実装しているので push 可能
    context.subscriptions.push(client);
    // === コマンド登録 ===
    context.subscriptions.push(vscode.commands.registerCommand("mz80.runMake", () => {
        vscode.window.showInformationMessage("mz80: Run Make (P0 stub)");
    }));
    // === DAP設定 ===
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
            config.cwd = config.cwd ?? findWorkspaceRoot();
            if (!fs.existsSync(config.cliEntry)) {
                void vscode.window.showErrorMessage(`mz80 cli not found: ${config.cliEntry}`);
                logDap(`[config] cli missing: ${config.cliEntry}`);
                return null;
            }
            if (config.request === "launch") {
                config.rpcListen = config.rpcListen ?? "127.0.0.1:4700";
                if (!config.program || String(config.program).trim().length === 0) {
                    void vscode.window.showErrorMessage("mz80 launch requires `program` (.com/.bin path).");
                    logDap("[config] launch rejected: missing program");
                    return null;
                }
                if (/\.com$/i.test(config.program)) {
                    config.cpm = config.cpm ?? true;
                    config.cpmInteractive = config.cpmInteractive ?? true;
                }
                config.smap = config.smap ?? guessSidecarFile(config.program, ".smap");
                config.sym = config.sym ?? guessSidecarFile(config.program, ".sym");
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
            // Ensure sidecar auto-detection still works after ${workspaceFolder} substitution.
            if (config.type === "mz80-dap" && config.request === "launch" && typeof config.program === "string") {
                config.smap = config.smap ?? guessSidecarFile(config.program, ".smap");
                config.sym = config.sym ?? guessSidecarFile(config.program, ".sym");
                logDap(`[config/subst] program=${config.program} smap=${config.smap ?? "(none)"} sym=${config.sym ?? "(none)"}`);
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
            logDap(`[descriptor] start adapter runtime=node cli=${cliEntry} cwd=${cfg.cwd ?? findWorkspaceRoot()}`);
            return new vscode.DebugAdapterExecutable("node", [cliEntry, "dap"], { cwd: cfg.cwd ?? findWorkspaceRoot() });
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

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
const node_1 = require("vscode-languageclient/node");
let client;
function activate(context) {
    // === LSPサーバ設定 ===
    const serverModule = path.join(context.extensionPath, "..", "lsp", "dist", "index.js");
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
    const dapExecutable = path.join(context.extensionPath, "..", "dap", "dist", "index.js");
    vscode.debug.registerDebugAdapterDescriptorFactory("mz80-dap", {
        createDebugAdapterDescriptor: (_session) => {
            return new vscode.DebugAdapterExecutable("node", [dapExecutable]);
        }
    });
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

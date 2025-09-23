import * as vscode from "vscode";
import * as path from "path";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  // === LSPサーバ設定 ===
  const serverModule = path.join(context.extensionPath, "..", "lsp", "dist", "index.js");
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
    outputChannelName: "MZ80 Language Server",   // 👈 独自ログチャンネル
  };

  client = new LanguageClient("mz80Lsp", "MZ80 LSP", serverOptions, clientOptions);

  // === LSPクライアント開始 ===
  client.start();
  // `client` 自体は Disposable を実装しているので push 可能
  context.subscriptions.push(client);


  // === コマンド登録 ===
  context.subscriptions.push(
    vscode.commands.registerCommand("mz80.runMake", () => {
      vscode.window.showInformationMessage("mz80: Run Make (P0 stub)");
    })
  );

  // === DAP設定 ===
  const dapExecutable = path.join(context.extensionPath, "..", "dap", "dist", "index.js");
  vscode.debug.registerDebugAdapterDescriptorFactory("mz80-dap", {
    createDebugAdapterDescriptor: (_session) => {
      return new vscode.DebugAdapterExecutable("node", [dapExecutable]);
    }
  });
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

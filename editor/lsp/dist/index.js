"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_js_1 = require("vscode-languageserver/node.js");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
// 接続生成（stdioベース: LSP標準）
const connection = (0, node_js_1.createConnection)(node_js_1.ProposedFeatures.all);
// 管理するドキュメント
const documents = new node_js_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
// 初期化リクエスト
connection.onInitialize((_params) => {
    return {
        capabilities: {
            textDocumentSync: node_js_1.TextDocumentSyncKind.Incremental
        }
    };
});
// ドキュメントオープン
documents.onDidOpen((event) => {
    connection.console.log(`Document opened: ${event.document.uri}`);
});
// ドキュメント変更
documents.onDidChangeContent((event) => {
    // ダミー成功
    // connection.console.log(`Document changed: ${event.document.uri}`);
    // // 常に診断なしを返す
    // connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
    // 仮のエラーダイアグノスティクス
    const diagnostics = [
        {
            severity: node_js_1.DiagnosticSeverity.Error,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 5 }
            },
            message: "仮エラー: とりあえず何か返しています",
            source: "mz80"
        }
    ];
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics });
});
// ドキュメントクローズ
documents.onDidClose((event) => {
    connection.console.log(`Document closed: ${event.document.uri}`);
});
// ドキュメント管理開始
documents.listen(connection);
// 接続開始
connection.listen();

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_js_1 = require("vscode-languageserver/node.js");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const diagnostics_1 = require("./diagnostics");
const semanticTokens_1 = require("./semanticTokens");
// 接続生成（stdioベース: LSP標準）
const connection = (0, node_js_1.createConnection)(node_js_1.ProposedFeatures.all);
// 管理するドキュメント
const documents = new node_js_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
// 初期化リクエスト
connection.onInitialize((_params) => {
    return {
        capabilities: {
            textDocumentSync: node_js_1.TextDocumentSyncKind.Incremental,
            semanticTokensProvider: {
                legend: (0, semanticTokens_1.getSemanticTokenLegend)(),
                full: true,
            },
        }
    };
});
// ドキュメントオープン
documents.onDidOpen((event) => {
    connection.console.log(`Document opened: ${event.document.uri}`);
    connection.sendDiagnostics({
        uri: event.document.uri,
        diagnostics: (0, diagnostics_1.collectDiagnostics)(event.document),
    });
});
// ドキュメント変更
documents.onDidChangeContent((event) => {
    connection.sendDiagnostics({
        uri: event.document.uri,
        diagnostics: (0, diagnostics_1.collectDiagnostics)(event.document),
    });
});
// ドキュメントクローズ
documents.onDidClose((event) => {
    connection.console.log(`Document closed: ${event.document.uri}`);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});
connection.languages.semanticTokens.on((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return { data: [] };
    }
    return (0, semanticTokens_1.collectSemanticTokens)(document, params);
});
// ドキュメント管理開始
documents.listen(connection);
// 接続開始
connection.listen();

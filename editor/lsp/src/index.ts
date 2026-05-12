import {
  createConnection,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  SemanticTokensParams,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js";

import { TextDocument } from "vscode-languageserver-textdocument";
import { collectDiagnostics } from "./diagnostics";
import { collectSemanticTokens, getSemanticTokenLegend } from "./semanticTokens";

// 接続生成（stdioベース: LSP標準）
const connection = createConnection(ProposedFeatures.all);

// 管理するドキュメント
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// 初期化リクエスト
connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      semanticTokensProvider: {
        legend: getSemanticTokenLegend(),
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
    diagnostics: collectDiagnostics(event.document),
  });
});

// ドキュメント変更
documents.onDidChangeContent((event) => {
  connection.sendDiagnostics({
    uri: event.document.uri,
    diagnostics: collectDiagnostics(event.document),
  });
});

// ドキュメントクローズ
documents.onDidClose((event) => {
  connection.console.log(`Document closed: ${event.document.uri}`);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }
  return collectSemanticTokens(document, params);
});

// ドキュメント管理開始
documents.listen(connection);

// 接続開始
connection.listen();

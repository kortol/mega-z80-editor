# Editor Components

`editor/` 配下は VSCode 連携まわりの実装を置く場所ですが、成熟度は揃っていません。

## Current Path

- `vscode-ext/`
  - 現在のユーザー向け入口
  - `packages/cli` の DAP と LSP を起動・接続する

## Experimental / Legacy Path

- `lsp/`
  - 初期 LSP 実験実装
  - まだ仮診断中心で、現行の言語機能基盤としては弱い
- `dap/`
  - 初期 DAP 実験実装
  - 現在の主経路は `packages/cli/src/dap` に移っている

## Rule

- 新しい editor 連携を追加する場合は、まず `vscode-ext` と `packages/cli` の責務を優先する
- `lsp/` と `dap/` は削除候補ではあるが、いったん履歴として残している

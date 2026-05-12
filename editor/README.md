# Editor Components

`editor/` 配下は VSCode 連携まわりの実装を置く場所です。

## Current Path

- `vscode-ext/`
  - 現在のユーザー向け入口
  - `packages/cli` の DAP と LSP を起動・接続する
- `lsp/`
  - `vscode-ext` に同梱する LSP runtime
  - diagnostics と semantic tokens を提供する

## Rule

- 新しい editor 連携を追加する場合は、まず `vscode-ext` と `packages/cli` の責務を優先する
- LSP 機能は `editor/lsp`、DAP 機能は `packages/cli/src/dap` に寄せる

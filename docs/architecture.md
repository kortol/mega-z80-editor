# Architecture

## Runtime layers

```text
VS Code extension ── starts/connects ── private LSP and CLI/DAP runtime
                                         |
CLI ──> C compiler ──> assembler ──> core
 |             \───────────────> core
 \────────────────────────────> assembler/core

LSP ──> assembler public language-service API
```

`core` は language、process、DAP、VS Code API に依存しません。`ToolchainDrivers` の contract は path、target、artifact、diagnostic summary、`BuildStatus`、build request/result を扱い、process exit code は CLI が変換します。

## Ownership

- `packages/core`: object/link/archive、debugger core、device/I/O、source map、共通 contract
- `packages/assembler`: Z80 source parser から REL 生成までと language-service facade
- `packages/c-compiler`: SCC frontend、bundled C runtime、C subset documentation
- `packages/cli`: command compatibility、project orchestration、stdio、DAP transport/server
- `editor/lsp`: private assembler LSP runtime
- `editor/vscode-ext`: packaged LSP と CLI/DAP runtime を起動する extension

## Source and distribution rules

- package 間は package root の public `exports` だけを import する
- package 間の相対参照、`src`/`dist` deep import、非公開 subpath import を禁止する
- VS Code extension は toolchain package の source/dist を直接 import しない
- 公開4 package は同一 version で package 化し、tarball と VSIX で独立起動を検査する

機械的な依存検査は `pnpm run check:boundaries`、version/entrypoint 検査は `pnpm run check:versions` で実行します。

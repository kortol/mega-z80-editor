# Editor components

`editor/` は VS Code integration を所有します。

- `lsp/`: private `@mz80/lsp`。`@mz80/assembler` の公開 language-service API だけを使う stdio LSP runtime
- `vscode-ext/`: packaged LSP と CLI/DAP runtime を起動・接続する VS Code extension

extension は core、assembler、C compiler の source/dist/private export を直接参照しません。配布物は runtime dependency を含む VSIX として `pnpm run check:vsix` で検証します。

```bash
pnpm --filter @mz80/lsp run build
pnpm --filter z80-assembler-language run build
pnpm --filter z80-assembler-language run package:vsix
```

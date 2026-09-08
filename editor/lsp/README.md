# `@mz80/lsp`

VS Code extension に同梱する private LSP runtime です。registry へ公開しません。

assembler source の diagnostics と semantic tokens を提供し、`@mz80/assembler` の公開 language-service API のみを参照します。CLI、C compiler、core、VS Code extension source への deep import は行いません。

```bash
pnpm --filter @mz80/lsp run build
pnpm --filter @mz80/lsp run typecheck
```

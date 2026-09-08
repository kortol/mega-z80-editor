# `@mz80/core`

Language、CLI、DAP、VS Code に依存しない MZ80 の基盤 package です。

## Owns

- REL/archive/linker と出力 adapter
- source map、I/O bus、device model
- protocol 非依存 debugger core と RPC support
- language 非依存の `BuildStatus`、`ToolchainDrivers`、build request/result contract

CLI の process exit code や language-specific AST/diagnostics は core API に含めません。

## Development

```bash
pnpm --filter @mz80/core run build
pnpm --filter @mz80/core run test
```

Dependency rules: [../../docs/package-boundaries.md](../../docs/package-boundaries.md)

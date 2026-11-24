# `@mz80/core`

Language、CLI、DAP、VS Code に依存しない MZ80 の基盤 package です。

## Owns

- REL/archive/linker と出力 adapter
- source map、I/O bus、device model
- protocol 非依存 debugger core と RPC support
- language 非依存の `BuildStatus`、`ToolchainDrivers`、build request/result contract

CLI の process exit code や language-specific AST/diagnostics は core API に含めません。

`link(..., {memory})` は opt-in の16-bit flat配置を検査します。公開型は `LinkMemoryLayout`、
`MemoryLayoutReport`。code/RAM領域、stack/heap予約、ROM DATA の load/runtime address 分離に対応し、
配置結果を `.memory.json` に出力します。CUSTOM/ASEG と banked memory はこの配置モードの対象外です。
C startup の生成は [c-compilerの責務](../c-compiler/docs/scc-target-startup-design.md) です。

## Development

```bash
pnpm --filter @mz80/core run build
pnpm --filter @mz80/core run test
```

Dependency rules: [../../docs/package-boundaries.md](../../docs/package-boundaries.md)

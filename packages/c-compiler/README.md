# `@mz80/c-compiler`

SCC TypeScript C compiler、bundled C runtime、C-to-assembler translation を提供します。

## Owns

- SCC frontend と semantic/lowering pipeline
- `TsSccCompiler` / compiler adapter
- bundled CP/M runtime assets
- C subset、ABI、array design の一次 documentation

この package は `@mz80/assembler` と `@mz80/core` の公開 API にだけ依存します。CLI compatibility や DAP は `@mz80/cli` の責務です。

## Development

```bash
pnpm --filter @mz80/c-compiler run build
pnpm --filter @mz80/c-compiler run test
```

詳細は [docs/README.md](docs/README.md) を参照してください。

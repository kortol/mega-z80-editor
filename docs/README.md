# Documentation map

## Current documentation

- [architecture.md](architecture.md): runtime layers と ownership
- [package-boundaries.md](package-boundaries.md): package dependency と public API 境界
- [spec/](spec/README.md): assembler、REL、linker、source model の仕様
- [../packages/assembler/docs/](../packages/assembler/docs/README.md): PEG parser compatibility
- [../packages/c-compiler/docs/](../packages/c-compiler/docs/README.md): SCC TypeScript C compiler、ABI、C subset
- [examples-repo.md](examples-repo.md): sibling examples repository の扱い
- [../editor/README.md](../editor/README.md): LSP と VS Code extension

## Historical documentation

[dev/](dev/README.md) は過去の設計判断を保存する履歴です。現行仕様としては扱わず、現在の README と上記の current documentation を優先します。

## Documentation ownership

- cross-package architecture: `docs/`
- assembler/linker contracts: `docs/spec/`
- C compiler behavior and ABI: `packages/c-compiler/docs/`
- package usage and exports: each package `README.md`

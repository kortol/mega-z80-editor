# Documentation map

## Current documentation

- [architecture.md](architecture.md): runtime layers と ownership
- [package-boundaries.md](package-boundaries.md): package dependency と public API 境界
- [spec/](spec/README.md): assembler、REL、linker、source model の仕様
- [../packages/assembler/docs/](../packages/assembler/docs/README.md): PEG parser compatibility
- [../packages/c-compiler/docs/](../packages/c-compiler/docs/README.md): SCC TypeScript C compiler、ABI、C subset
- [examples-repo.md](examples-repo.md): sibling examples repository の扱い
- [../editor/README.md](../editor/README.md): LSP と VS Code extension
- [../scripts/README.md](../scripts/README.md): root verification scripts と command map

## Historical documentation

[dev/](dev/README.md) は過去の設計判断を保存する履歴です。現行仕様としては扱わず、現在の README と上記の current documentation を優先します。

## Documentation ownership

- cross-package architecture: `docs/`
- assembler/linker contracts: `docs/spec/`
- C compiler behavior and ABI: `packages/c-compiler/docs/`
- package usage and exports: each package `README.md`

## Reading and maintenance rules

新しい作業を始めるときは、root `README`、対象 package の `README`、その package の current docs の順に読む。
`docs/dev/` と package 内の migration / coverage phase 文書は、設計判断の履歴であり current status の
根拠には使わない。

- public API、runtime selection、supported language/library surface を変える変更は、同じ変更で package
  `README` と current docs を更新する。
- C compiler の language feature は C Subset matrix、internal ABI は binary ABI、runtime public surface は
  runtime guide を更新する。
- generated `dist` を管理する package では source と artifact を同じ build で再生成し、artifact のみを
  source of truth として編集しない。

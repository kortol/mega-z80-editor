# Package boundaries

この文書は monorepo の所有権と import 境界の一次資料です。

## Allowed dependencies

```text
cli → c-compiler → assembler → core
cli → assembler, core
c-compiler → core
lsp → assembler
```

`core` から toolchain package への依存、assembler から C compiler/CLI/LSP への依存、C compiler から CLI/LSP への依存は禁止です。`import type` も同じ方向制約に従います。

## Public APIs

- `@mz80/core`: language 非依存の build contract と core runtime API
- `@mz80/assembler`: assemble API、公開 diagnostics、language-service API
- `@mz80/c-compiler`: compile API、runtime lookup、公開 diagnostics
- `@mz80/cli`: `mz80` executable と CLI adapter

LSP は private package で registry 公開しません。VS Code extension は bundled runtime の起動・接続だけを担当します。

## Enforcement

- `pnpm run check:boundaries`: manifest、通常 import、`import type`、relative/deep/subpath import を静的検査
- `pnpm run check:versions`: version、publish metadata、exports/types/bin の build output を検査
- `pnpm run check:pack`: tarball metadata、assets、clean install を検査
- `pnpm run check:vsix`: extension package 内の runtime を検査

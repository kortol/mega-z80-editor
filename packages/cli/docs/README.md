# CLI Docs

`packages/cli/docs/` は package ローカルの補助資料置き場です。

## Files

- `peg-compat-cases.md`
  - PEG parser の互換状況メモ
- `scc-cpm-library.md`
  - Small-C library を `mz80` archive / CP/M runtime と組み合わせる手順
- `scc-ts-migration.md`
  - Small-C compiler を TypeScript 化するための adapter / fixture / helper 棚卸しメモ
- `scc-ts-full-c-coverage-phase0.md`
  - `TsSccCompiler` の Full C coverage 現状調査と次タスク整理

## Rule

- 全体設計や cross-package の話は `docs/` に置く
- `@mz80/cli` に閉じる詳細メモだけをここに置く

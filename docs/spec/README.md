# Specs

`docs/spec/` は現行実装に近い概念整理の置き場です。まだ完全に同期されているわけではありませんが、`docs/dev/` よりは現在の責務に近い資料として扱います。

各 spec には冒頭で次の 3 点を揃えています。

- `Status`
  - 現時点での扱い。今はすべて current reference として整理
- `Audience`
  - 主にどの実装領域の変更時に読むべきか
- `Related`
  - 一緒に読むと前提が揃う spec

## Spec Map

- `node-abi-spec.md`
  - assembler 内部ノード契約
- `source-abi-spec.md`
  - source location / source 情報の扱い
- `parser-contract-spec.md`
  - parser とその出力契約
- `macro-expansion-spec.md`
  - macro 展開モデル
- `analyze-phase-spec.md`
  - 解析フェーズの責務
- `expression-value-spec.md`
  - 式評価の扱い
- `symbol-base-spec.md`
  - symbol の基本概念
- `symbol-table-spec.md`
  - symbol table の構造
- `relocation-spec.md`
  - relocation モデル
- `section-memory-model-spec.md`
  - section / memory 配置モデル
- `output-format-base-spec.md`
  - 出力形式の共通基盤
- `output-file-specs.md`
  - 各出力ファイルの整理
- `linker-contract-spec.md`
  - linker 側の契約

## Suggested Order

1. `node-abi-spec.md`
2. `source-abi-spec.md`
3. `parser-contract-spec.md`
4. `macro-expansion-spec.md`
5. `analyze-phase-spec.md`
6. `expression-value-spec.md`
7. `symbol-base-spec.md`
8. `symbol-table-spec.md`
9. `relocation-spec.md`
10. `section-memory-model-spec.md`
11. `output-format-base-spec.md`
12. `output-file-specs.md`
13. `linker-contract-spec.md`

## Rule

- 仕様を更新する場合は、実装とズレた抽象説明を増やしすぎない
- package ローカルの挙動メモは `packages/cli/docs/` に置く

# Examples Repo

大きいサンプル群と互換検証用の入力は、メインの monorepo から分離して `mega-z80-examples` repo に置きます。

## Default Location

- 既定の参照先は sibling repo `../mega-z80-examples`
- 別の場所を使う場合は `MZ80_EXAMPLES_DIR` 環境変数で上書きする

## What Stays In Main Repo

- `packages/cli/tests/`
  - 再現性を重視する自動テスト fixture

## What Moves Out

- `hello/`, `hello-msx/`, `bbcbasic-z80/`
- `cli/include-smoke/`, `cli/linktest/`
- `p1-c/`, `p1-d/`, `z80test/`, `cpm2-asm/`
- imported corpus や手動検証用の大きいサンプル群

## Operational Notes

- VSCode の launch 設定は `../mega-z80-examples` を向く
- `packages/cli` の一部手動検証スクリプトも同じ既定パスを使う
- examples repo が無い環境では、外部サンプル依存のテストや手動検証はスキップまたは失敗する

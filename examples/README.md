# Examples

このディレクトリには性格の異なるサンプルが混在しています。

## Active Samples

- `hello/`
  - 最小の CP/M 向けサンプル
- `hello-msx/`
  - MSX 向けの小さな動作サンプル
- `bbcbasic-z80/`
  - 大きめの実ファイル検証用

## Regression / Compatibility Inputs

- `p1-c/`
- `p1-d/`
- `z80test/`
- `cpm2-asm/`

これらはテストや互換確認の入力として使う前提で、必ずしも「整った配布サンプル」ではありません。

## Imported Reference Corpora

- `Z80-Optimized-Routines/`
- `z80float/`
- `cpm2-plm/`

外部由来の資料やコード群です。現役の product sample というより、調査・比較・将来検証のための参照資産です。

## Rule

- `src/` や原本入力は追跡する
- `build/`, `dist/`, `.rel`, `.bin`, `.map`, `.sym` などの生成物は原則追跡しない

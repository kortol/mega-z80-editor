# Architecture

## Top Level

- `packages/cli`
  - 現在の主実装
  - assembler, linker, debugger, DAP, source map をここに集約
- `editor/vscode-ext`
  - VSCode extension
  - LSP 起動、DAP 起動、debug configuration 解決
- `editor/lsp`
  - VSCode extension に同梱する LSP runtime
  - PEG parser と semantic tokens の言語機能を提供
- `../mega-z80-examples`
  - 実ファイル検証、互換確認、手動検証用サンプルの別 repo
  - 既定では sibling repo として参照し、必要なら `MZ80_EXAMPLES_DIR` で差し替える
- `tools`
  - エミュレータや比較用ツールのローカル配置先

## `packages/cli/src`

- `assembler/`
  - パーサ、式評価、疑似命令、マクロ、REL 出力
- `linker/`
  - REL 読み込み、配置、各種出力生成
- `debugger/`
  - バイナリ実行、CP/M 支援、RPC、セッション管理
- `dap/`
  - VSCode 向け DAP bridge
- `cli/`
  - `mz80 as/link/dbg/dbg-remote/dap` の各サブコマンド
- `io/`, `devices/`
  - デバッグ時の I/O バスとデバイス
- `sourcemap/`
  - source map モデル

## Structure Rules

- 実装本体は `packages/cli/src` に置く
- 自動テスト外で使う smoke fixture や link 用サンプルは `../mega-z80-examples/cli/` に置く
- 大きいサンプル群や imported corpus は `../mega-z80-examples` に置く
- 生成物は追跡しない。必要なら build/test で再生成する
- フェーズ設計メモは `docs/dev/`、現行の参照説明は `README` と `docs/spec/` に寄せる
- editor 連携の現役導線は `packages/cli`, `editor/lsp`, `editor/vscode-ext` を優先する

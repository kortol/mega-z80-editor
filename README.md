# MegaZ80Editor

Z80 向けのアセンブラ、リンカ、デバッガ、VSCode 連携をまとめた monorepo です。

現状の中心は `packages/cli` で、ここに assembler/linker/debugger/DAP/source map の実装があります。`editor/` には VSCode extension と、その同梱用の LSP runtime があります。

## Repository Layout

```text
mega-z80-editor/
|- packages/
|  `- cli/            # 現在の主実装。assembler / linker / debugger / DAP
|- editor/
|  |- vscode-ext/     # VSCode extension
|  `- lsp/            # VSCode extension に同梱する LSP runtime
|- docs/
|  |- spec/           # 現行仕様メモ
|  `- dev/            # フェーズ別の履歴・設計メモ
`- tools/             # ローカル検証用の外部ツール置き場
```

## Current State

- `mz80 as` で `.asm` から `.rel` を生成
- `mz80 link` で `.rel` から `.bin/.com/.map/.sym/.smap/.log` を生成
- `mz80 dbg` でバイナリのデバッグ、CP/M 実行、RPC 提供
- `mz80 dbg-remote` で RPC デバッガへ接続
- `mz80 dap` で VSCode から利用する DAP bridge を起動
- VSCode extension から `mz80-dap` launch/attach を利用可能

## Workspace Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm run check
```

開発用の入口は用途ごとに分けています。

```bash
pnpm run dev:cli -- --help
pnpm run dev:lsp
pnpm run dev:vscode-ext
pnpm run store:prune
```

個別 package の操作は `pnpm -C ...` を使います。

```bash
pnpm -C packages/cli run build
pnpm -C packages/cli run test
pnpm -C packages/cli run lint
```

## Documentation

- 全体案内: [docs/README.md](C:/Workspace/work/mega-z80-editor/docs/README.md)
- CLI/package の説明: [packages/cli/README.md](C:/Workspace/work/mega-z80-editor/packages/cli/README.md)
- PEG 互換メモ: [packages/cli/docs/peg-compat-cases.md](C:/Workspace/work/mega-z80-editor/packages/cli/docs/peg-compat-cases.md)
- examples repo の説明: [docs/examples-repo.md](C:/Workspace/work/mega-z80-editor/docs/examples-repo.md)
- editor 配下の位置づけ: [editor/README.md](C:/Workspace/work/mega-z80-editor/editor/README.md)

## Notes

- `docs/dev/` は現行仕様というより履歴・フェーズメモです
- サンプルや互換検証用入力は sibling repo `../mega-z80-examples` を既定で参照します。必要なら `MZ80_EXAMPLES_DIR` で上書きできます
- `tools/` はローカル検証用で、配布前提の成果物ではありません
- `editor/lsp` は extension 同梱用 runtime です。デバッグ導線の本体は `packages/cli` 側にあります
- root の `clean` script は廃止しました。依存キャッシュ整理だけ必要なら `pnpm run store:prune` を使います

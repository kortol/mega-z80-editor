# `@mz80/cli`

この package はリポジトリの中心実装です。assembler、linker、debugger、DAP bridge をまとめています。

## Commands

```bash
mz80 check-config
mz80 as input.asm output.rel
mz80 link output.bin input.rel
mz80 dbg program.bin
mz80 dbg-remote --connect 127.0.0.1:4700
mz80 dap
```

## Package Layout

```text
packages/cli/
|- src/
|  |- assembler/      # parser / macro / pseudo / rel writer
|  |- linker/         # rel parser / linker core / output adapters
|  |- debugger/       # runtime, CP/M support, RPC, sessions
|  |- dap/            # DAP bridge
|  |- cli/            # subcommand entry points
|  |- io/             # I/O bus abstractions
|  |- devices/        # debugger device implementations
|  `- sourcemap/      # source map model
|- docs/              # package-local notes
`- tools/             # build/test helper scripts
```

## Development

```bash
pnpm -C packages/cli run build
pnpm -C packages/cli run test
pnpm -C packages/cli run lint
```

## Config

`mz80.yaml` で CLI の既定値を指定できます。

```yaml
as:
  relVersion: 2
  sym: true
  lst: true
  smap: true
  sjasmCompat: true
  symLen: 32
  includePaths:
    - ./inc

link:
  com: true
  map: true
  sym: true
  smap: true
  log: true
  binFrom: 0x0100
  binTo: 0x7FFF
  orgText: 0x0100
  orgData: 0x8000
  orgBss: 0x9000
```

## Notes

- PEG parser が標準経路です
- VSCode から使う DAP は `mz80 dap` を経由します
- RPC デバッグや source map 関連は `src/debugger/` と `src/dap/` にあります
- package ローカル docs の入口は [docs/README.md](C:/Workspace/work/mega-z80-editor/packages/cli/docs/README.md) です
- 互換メモは [docs/peg-compat-cases.md](C:/Workspace/work/mega-z80-editor/packages/cli/docs/peg-compat-cases.md) を参照してください
- smoke fixture や link 用サンプルは `../mega-z80-examples/cli/` を既定参照します

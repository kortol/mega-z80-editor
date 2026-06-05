# `@mz80/cli`

この package はリポジトリの中心実装です。assembler、linker、debugger、DAP bridge をまとめています。

## Commands

```bash
mz80 check-config
mz80 as input.asm output.rel
mz80 link output.bin input.rel
mz80 ar output.lib input1.rel input2.rel
mz80 scc-asm input.scc.asm output.asm
mz80 scc-runtime cpmlibc runtime.scc.asm
mz80 scc-lib output.lib path/to/LIB --preset cpm-stdio -I path/to/INCLUDE --wsl
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
pnpm -C packages/cli run start
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

targets:
  demo:
    output: build/demo.com
    runtime: cpmlibc
    libraries:
      - build/libcpm-stdio.lib
    link:
      com: true
      orgText: 0x0100
    modules:
      - src/main.asm
```

## SCC / CP-M

`mz80 scc-lib` は Small-C の `.C` ライブラリソースを `dcpp -> sccz80 -> SCC asm translator -> mz80 as -> mz80 ar` で `.lib` に変換します。

`runtime: cpmlibc` を target に指定すると、bundled runtime を自動生成して link 入力へ加えます。これは `fgetc`, `fputc`, `exit` と最小限の SCC helper だけを持ち、`putchar`, `getchar`, `puts`, `fputs` などは library 側に任せる構成です。

実際の CP/M stdio library を組む例:

```bash
mz80 scc-lib build/libcpm-stdio.lib C:/Workspace/work/mega-z80-examples/Z80SCC/LIB \
  --preset cpm-stdio \
  -I C:/Workspace/work/mega-z80-examples/Z80SCC/INCLUDE \
  --wsl \
  --dcpp /mnt/c/Workspace/work/mega-z80-examples/Z80SCC/bin/dcpp \
  --sccz80 /mnt/c/Workspace/work/mega-z80-examples/Z80SCC/bin/sccz80
```

## Notes

- PEG parser が標準経路です
- VSCode から使う DAP は `mz80 dap` を経由します
- RPC デバッグや source map 関連は `src/debugger/` と `src/dap/` にあります
- package ローカル docs の入口は [docs/README.md](C:/Workspace/work/mega-z80-editor/packages/cli/docs/README.md) です
- SCC / CP/M library 手順は [docs/scc-cpm-library.md](C:/Workspace/work/mega-z80-editor/packages/cli/docs/scc-cpm-library.md) を参照してください
- 互換メモは [docs/peg-compat-cases.md](C:/Workspace/work/mega-z80-editor/packages/cli/docs/peg-compat-cases.md) を参照してください
- smoke fixture や link 用サンプルは `../mega-z80-examples/cli/` を既定参照します

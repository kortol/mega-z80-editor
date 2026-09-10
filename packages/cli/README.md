# `@mz80/cli`

`mz80` executable を提供する command adapter package です。assembler/C compiler/core の公開 API を接続し、stdio、diagnostic 表示、process exit code、project build、DAP server を担当します。

## Commands

```bash
mz80 check-config
mz80 as input.asm output.rel
mz80 link output.bin input.rel
mz80 ar output.lib input1.rel input2.rel
mz80 scc-asm input.scc.asm output.asm
mz80 scc-runtime cpmlibc runtime.scc.asm
mz80 scc-lib output.lib path/to/LIB --preset cpm-stdio
mz80 cc hello.c hello.com --compiler ts --runtime-platform cpm --runtime-profile full
mz80 dbg program.bin
mz80 dbg-remote --connect 127.0.0.1:4700
mz80 dap
```

`mz80.yaml` の path resolution、command options/default、stdout/stderr、exit code、build output と debugger configuration は CLI compatibility surface です。

## Boundaries

- DAP protocol、transport、server adapter は `src/dap/`
- project orchestration と command adapter は `src/`
- assembler、C compiler、core の implementation source/dist を import しない

```bash
pnpm --filter @mz80/cli run build
pnpm --filter @mz80/cli run test
pnpm run mz80 -- --help
```

C compiler docs: [../c-compiler/docs/README.md](../c-compiler/docs/README.md)

Runtime platform/profile と bundled header の詳細は
[C runtime guide](../c-compiler/docs/scc-runtime-guide.md) を参照してください。

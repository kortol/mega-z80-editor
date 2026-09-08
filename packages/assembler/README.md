# `@mz80/assembler`

Z80 source の tokenize、PEG parse、macro expansion、analysis、code generation、REL generation と language-service API を提供します。

## Public surface

- source/file assemble API
- public diagnostics
- assembler language-service facade

parser grammar は build 時に生成し、distribution には parser runtime と PEG grammar asset を含めます。C compiler と LSP は package root の public export だけを利用します。

## Development

```bash
pnpm --filter @mz80/assembler run build
pnpm --filter @mz80/assembler run test
```

Assembler/linker contracts: [../../docs/spec/README.md](../../docs/spec/README.md)

PEG compatibility evidence: [docs/README.md](docs/README.md)

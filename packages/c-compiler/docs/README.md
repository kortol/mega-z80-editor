# SCC TypeScript C compiler documentation

この directory は `@mz80/c-compiler` の現行 behavior、ABI、C subset の一次資料です。

## Current references

- [scc-ts-c-subset.md](scc-ts-c-subset.md): supported / unsupported C subset matrix
- [scc-ts-binary-abi.md](scc-ts-binary-abi.md): generated code、aggregate、pointer-to-array、variadic ABI
- [scc-ts-array-element-design.md](scc-ts-array-element-design.md): fixed-size multidimensional array design
- [scc-cpm-library.md](scc-cpm-library.md): CP/M runtime と library build
- [scc-runtime-guide.md](scc-runtime-guide.md): multi-platform runtime configuration と ABI

## Historical and planning notes

- `scc-ts-migration.md`
- `scc-ts-full-c-coverage-phase0.md`
- `scc-ts-full-c-coverage-phase0b.md`

これらは調査・移行の背景として保持します。現在の対応可否を判断する際は C subset matrix と ABI 文書を優先してください。

## Related documentation

- package usage: [../README.md](../README.md)
- assembler compatibility: [../../assembler/docs/README.md](../../assembler/docs/README.md)
- assembler/linker contracts: [../../../docs/spec/README.md](../../../docs/spec/README.md)
- package boundaries: [../../../docs/package-boundaries.md](../../../docs/package-boundaries.md)

# SCC TypeScript C compiler documentation

この directory は `@mz80/c-compiler` の現行 behavior、ABI、C subset の一次資料です。

## Current references

- [scc-numeric-design.md](scc-numeric-design.md): N1 fixed/BCD の独立 optional module、数値仕様案、Goal と delivery slice

- [scc-heap-design.md](scc-heap-design.md): H1 heap の Goal、arena/API/ABI/debug contract と 3 delivery slice

- [scc-ts-c-subset.md](scc-ts-c-subset.md): supported / unsupported C subset matrix
- [scc-ts-binary-abi.md](scc-ts-binary-abi.md): generated code、aggregate、pointer-to-array、variadic ABI
- [scc-ts-static-frame-abi-design.md](scc-ts-static-frame-abi-design.md): A1.1 non-reentrant ABI の Goal、MVP contract、task 分解
- [scc-ts-array-element-design.md](scc-ts-array-element-design.md): fixed-size multidimensional array design
- [scc-runtime-guide.md](scc-runtime-guide.md): multi-platform runtime configuration、ABI、library boundary、artifact
- [scc-feature-plan.md](scc-feature-plan.md): 全体 Feature List、次期の repository 整備、ABI profile、heap、numeric / float 拡張計画
- [scc-cpm-library.md](scc-cpm-library.md): external Z80SCC / Small-C 向け legacy CP/M library build

対応可否は C subset matrix、internal ABI は binary ABI 文書、runtime の public surface は runtime guide を
正本とする。Feature Plan は次期拡張の task と受入条件を定義するが、現行 Subset の進捗率は変更しない。

## Runtime source ownership

- [../dist/scc/runtime/README.md](../dist/scc/runtime/README.md): runtime source、header、生成 artifact の所有関係と build flow（配布物にも同梱）
- platform/runtime API: [scc-runtime-guide.md](scc-runtime-guide.md)
- legacy external-SCC library path: [scc-cpm-library.md](scc-cpm-library.md)

## Historical and planning notes

- `scc-ts-migration.md`: TypeScript source-path 移行時の phase 記録。Phase 10 の checklist は current progress ではない。
- `scc-ts-full-c-coverage-phase0.md`
- `scc-ts-full-c-coverage-phase0b.md`

これらは調査・移行の背景として保持します。現在の対応可否を判断する際は C subset matrix、binary ABI、runtime guide を優先してください。

仕様を変更する pull request では、対応する current reference と実行証跡を同時に更新する。generated
runtime artifact は source の代替資料ではなく、`pnpm run build` の出力である。

## Related documentation

- package usage: [../README.md](../README.md)
- assembler compatibility: [../../assembler/docs/README.md](../../assembler/docs/README.md)
- assembler/linker contracts: [../../../docs/spec/README.md](../../../docs/spec/README.md)
- package boundaries: [../../../docs/package-boundaries.md](../../../docs/package-boundaries.md)

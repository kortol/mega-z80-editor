# Bundled runtime source ownership

この directory は `@mz80/c-compiler` の bundled runtime の source of truth である。配布時は
`tools/copy-runtime.js` がこの tree を `dist/scc/runtime` へ copy し、`runtimeArtifacts.ts` が
prebuilt CRT REL と `libmz80c-full.lib` を生成する。`dist/scc/runtime/artifacts` を直接編集してはならない。

## Source layout

| path | ownership |
| --- | --- |
| `platform/cpm-lite.scc.asm` | CP/M structured runtime の lite CRT |
| `platform/msx-bios-lite.scc.asm` | MSX BIOS structured runtime の lite CRT。exit mode は build 時に注入する |
| `platform/raw-lite.scc.asm` | raw structured runtime の lite CRT。application 提供 hook を呼び出す |
| `lib/stdlib.scc.asm` | `abs`、`atoi`、`assert`、乱数を提供する full library module |
| `lib/string.scc.asm` | memory / string 操作を提供する full library module |
| `lib/ctype.scc.asm` | ASCII ctype を提供する full library module |
| `lib/stdio.scc.asm` | 限定 `printf` / `sprintf` を提供する full library module |
| `legacy/cpmcrt.scc.asm` | external-SCC 互換用の legacy CP/M runtime alias |
| `legacy/cpmlibc.scc.asm` | external-SCC library 併用用の legacy CP/M runtime alias |
| `include/` | bundled public C header。declaration と runtime export を同じ変更で更新する |

## Build flow

```text
src/scc/runtime
  -> tools/copy-runtime.js
  -> dist/scc/runtime
  -> runtimeArtifacts.buildBundledRuntimeArtifacts()
  -> artifacts/*-crt.rel, artifacts/libmz80c-full.lib
```

archive member の順序、source file、export symbol、external symbol は `src/scc/runtimeLibrary.ts` の
manifest が定義する。`runtimeArtifacts.ts` はこの manifest から archive を作る。新しい library module を
追加する場合は、同じ変更で manifest、header、linker extraction test を更新する。

## Editing checklist

1. public API を加える場合は `include/`、runtime source、[runtime guide](../../../docs/scc-runtime-guide.md) を更新する。
2. `pnpm -C packages/c-compiler run build` を実行し、配布 artifact を再生成する。
3. source-path CP/M execution test と artifact/linker test を追加または更新する。
4. platform/API の対応範囲を [Feature Plan](../../../docs/scc-feature-plan.md) と照合する。

R0 の後続 task は platform CRT と full library を source module に分割する。この README は移動前後で
保持し、CLI option、runtime selection、artifact file name を互換に保つ。

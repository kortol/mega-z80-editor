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
| `lib/heap.scc.asm` | explicit arena、4 allocation API、split/coalesce、opt-in debug / heap_check を提供する optional full library member |
| `legacy/cpmcrt.scc.asm` | external-SCC 互換用の legacy CP/M runtime alias |
| `legacy/cpmlibc.scc.asm` | external-SCC library 併用用の legacy CP/M runtime alias |
| `include/` | bundled public C header。declaration と runtime export を同じ変更で更新する |
| `include/mz80_numeric.h` | numeric 共通 status 定数。実行時 code は持たない |
| `numeric/fixed/` | optional Q8.8/Q16.16 header、constructor/CPU assembly と演算・変換 C source |
| `numeric/bcd/` | optional 16桁・小数4桁 BCD header、constructor/CPU assembly と演算・変換 C source |

## Build flow

```text
src/scc/runtime
  -> tools/copy-runtime.js
  -> dist/scc/runtime
  -> runtimeArtifacts.buildBundledRuntimeArtifacts()
  -> artifacts/*-crt.rel, artifacts/libmz80c-full.lib
  -> artifacts/libmz80-fixed-v1.lib, artifacts/libmz80-bcd-v1.lib (選択した配布 module のみ)
```

archive member の順序、source file、export symbol、external symbol は `src/scc/runtimeLibrary.ts` の
manifest が定義する。`runtimeArtifacts.ts` はこの manifest から archive を作る。新しい library module を
追加する場合は、同じ変更で manifest、header、linker extraction test を更新する。

numeric module は runtimeFeatures.ts の provider registry で利用時の選択と bridge を管理する。
通常 build は両 module を同梱するが利用時は既定無効。MZ80_NUMERIC_MODULES を
none/fixed/bcd/fixed,bcd に設定すると copy が未選択 directory を除外し、生成した
numeric/available.json を参照して archive を構築する。pack/prepack も同じ環境変数を引き継ぐ。
fixed/BCD の C member は build 時に ts-internal で compile し、生成 assembly と prebuilt REL に変換する。
*.generated.scc.asm は dist にだけ生成する。source-runtime 連結も同じ生成物を使う。
private CPU helper は application の compiler helper と別名で結び、heap/共有可変領域に依存しない。
test:fixed-runtime は BigInt vector、生成 Z80 の stack 上限、両 ABI の CP/M 実行を検証する。
test:bcd-runtime は BCD の同契約、test:numeric-builds は縮小 source / tarball / clean-install 実行を検証する。
test:msx-numeric は初期 DATA の RAM copy と cartridge page 2 選択を含む専用 startup で32構成を検証する。
詳しい手順は [numeric design](../../../docs/scc-numeric-design.md) を参照する。

## Editing checklist

1. public API を加える場合は `include/`、runtime source、[runtime guide](../../../docs/scc-runtime-guide.md) を更新する。
2. `pnpm -C packages/c-compiler run build` を実行し、配布 artifact を再生成する。
3. source-path CP/M execution test と artifact/linker test を追加または更新する。
4. platform/API の対応範囲を [Feature Plan](../../../docs/scc-feature-plan.md) と照合する。

R0 の後続 task は platform CRT と full library を source module に分割する。この README は移動前後で
保持し、CLI option、runtime selection、artifact file name を互換に保つ。

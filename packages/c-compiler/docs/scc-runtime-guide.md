# Multi-platform SCC runtime

`@mz80/c-compiler` は bundled runtime を構造化指定で選択できる。対象は固定 Z80 ABI の
`cpm`、`msx-bios`、`raw` であり、profile は `lite` と `full` である。`full` は `lite` を
包含する。既存の `cpmcrt` と `cpmlibc` は CP/M 向け legacy alias として維持する。

```yaml
cc:
  runtime:
    platform: msx-bios
    profile: lite
    exit: return # MSX BIOS のみ。省略時は halt
```

CLI では次を用いる。

```text
mz80 cc hello.c hello.bin --compiler ts --runtime-platform msx-bios --runtime-profile lite --runtime-exit return
```

`--runtime cpmcrt` / `--runtime cpmlibc` は互換用のまま残る。新しい option 群と legacy
`--runtime` は同時に指定できない。

## Defines and headers

runtime を選択した C build には、platform define と `MZ80_RUNTIME_LITE` / `MZ80_RUNTIME_FULL`
が自動定義される。MSX は `MZ80_MSX_EXIT_HALT` または `MZ80_MSX_EXIT_RETURN` も得る。
設定で注入される define の再定義・undef は診断になる。

bundled include directory は TS compiler と external Z80SCC compiler の両方へ渡される。
利用可能な header は `<stdio.h>`、`<string.h>`、`<ctype.h>`、`<mz80.h>` である。TS compiler
の preprocessor は quoted/angle include、object-like define、`ifdef`、`ifndef`、
`if defined(NAME)`、`else`、`endif` のみを受け付ける。function-like macro、未解決 include、
任意の system header は明示的に非対応である。

external Z80SCC の実行が必要な確認は local-required とする。この repository では adapter test が
bundled include directory と `MZ80_PLATFORM_*` / `MZ80_RUNTIME_*` define の `dcpp` 引数伝播を
固定する。external Z80SCC の一般 variadic ABI は対応しない。

## Lite API and platform ABI

lite は `exit`、`putchar`、`getchar`、NUL 終端文字列へ改行を付ける `puts` を提供する。
`outstr` と `mz80_cpm_outstr` は `$` 終端 CP/M BDOS 9 出力を必要とする legacy API として
CP/M runtime に残す。

| Platform | Output/input | exit |
| --- | --- | --- |
| CP/M | BDOS 2 / BDOS 1 | BDOS 0 |
| MSX BIOS | CHPUT `$00A2` / CHGET `$009F` | `halt` loop または caller `ret` |
| raw | `__mz80_raw_putc` / `__mz80_raw_getc` | `__mz80_raw_exit` |

raw target には固定 I/O port を仮定しない。3 hook symbol を application 側で実装しなければ
link error になる。hook は `__mz80_raw_putc(int)`、`__mz80_raw_getc(void)`、
`__mz80_raw_exit(int)` であり、application object または library から提供する。

## Local openMSX smoke

openMSX と C-BIOS を導入したローカル環境では、次で MSX BIOS lite runtime を cartridge ROM として
`C-BIOS_MSX1` へ起動し、`CHPUT` 経由の画面出力と `halt` / `return` の両 exit mode を検証できる。

```text
pnpm -C packages/c-compiler run test:msx-runtime
```

既定の実行ファイルは Windows の `C:\\Program Files\\openMSX\\openmsx.exe` である。別の場所では
`MZ80_OPENMSX` に executable path を指定する。この smoke は local-required であり CI の必須項目には
含めない。

## Full profile boundary

full profile は `memcpy`、`memset`、`memcmp`、`strcmp`、`strcpy`、`strlen`、ASCII `ctype` と
限定 `printf` / `sprintf` を追加する。format は `%%`、`%c`、`%s`、`%d`、`%u`、`%x`、`%X`、
`%p` を受け付ける。`%p` は `0x` に続く小文字4桁の16進値である。

bundled `<stdio.h>` から full profile で include された `printf` / `sprintf` だけを TS compiler
の internal variadic ABI provider として扱う。任意の external variadic declaration、external
Z80SCC との variadic ABI 互換、aggregate variadic argument は対象外である。width、precision、
length modifier、float、allocation、file I/O は対象外である。

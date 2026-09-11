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
利用可能な header は `<stdio.h>`、`<string.h>`、`<ctype.h>`、`<stddef.h>`、`<stdlib.h>`、
`<assert.h>`、`<stdarg.h>`、`<mz80.h>` である。`size_t` は current 16-bit `int` ABI の alias、`NULL` は `0` である。TS compiler
の preprocessor は quoted/angle include、object-like define、`ifdef`、`ifndef`、
`if defined(NAME)`、`else`、`endif` を受け付ける。function-like macro は bundled `<assert.h>` の
`assert(expression)` だけを例外的に展開する。任意の function-like macro、未解決 include、任意の
system header は明示的に非対応である。`<stdarg.h>` は TS SCC の internal variadic ABI 専用であり、
`va_start` / `va_arg` / `va_end` は compiler built-in として扱う。external Z80SCC の variadic ABI を意味しない。

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

openMSX と C-BIOS を導入したローカル環境では、次で MSX BIOS runtime を cartridge ROM として
`C-BIOS_MSX1` へ起動し、lite/full と `halt` / `return` の両 exit mode を検証できる。full case は
archive 由来の `printf`、`strlen`、`toupper` も実行する。

```text
pnpm -C packages/c-compiler run test:msx-runtime
```

既定の実行ファイルは Windows の `C:\\Program Files\\openMSX\\openmsx.exe` である。別の場所では
`MZ80_OPENMSX` に executable path を指定する。この smoke は local-required であり CI の必須項目には
含めない。

## Full profile boundary

full profile は `memcpy`、`memmove`、`memset`、`memcmp`、`strcmp`、C locale の `strcoll` / `strxfrm`、`strcpy`、`strcat`、`strncat`、`strncpy`、`strncmp`、
`strchr`、`strrchr`、`strpbrk`、`strspn`、`strcspn`、`strstr`、`strtok`、`strlen`、ASCII `ctype`（`isalpha`、`isalnum`、`iscntrl`、`isdigit`、`isgraph`、
`islower`、`isprint`、`ispunct`、`isspace`、`isupper`、`isxdigit`、`tolower`、`toupper`）と `EXIT_SUCCESS`、
`EXIT_FAILURE`、`abs`、`atoi`、`exit`、`rand`、`srand`、限定 `printf` / `sprintf`、`assert` を追加する。`atoi` は leading ASCII space/tab、
optional sign、decimal digits を受け付ける。format は `%%`、`%c`、`%s`、`%d`、`%u`、`%x`、`%X`、
`%p` を受け付ける。`%p` は `0x` に続く小文字4桁の16進値である。`assert(0)` は selected CRT の
`exit(1)` を実行する。`rand` は 15-bit の deterministic な疑似乱数であり、暗号用途には使えない。
`strtok` は C89 と同じ static continuation state を使うため reentrant ではない。heap allocation、`qsort` /
`bsearch`、診断 text/source location、numeric
conversion の全 C89 surface はまだ対象外である。

## C89 library boundary

この runtime は ANSI/C89 library 全体ではなく、16-bit `int`・8-bit `char` の fixed ABI に合わせた実行可能な
subset である。`full` profile の public surface と、意図的に未対応の境界は次のとおり。

| Header / category | Supported surface | Boundary |
| --- | --- | --- |
| `<assert.h>` | `assert` | assertion text/source location は出力しない。|
| `<ctype.h>` | ASCII classification 全12関数と `tolower` / `toupper` | locale / multibyte は持たない。|
| `<stddef.h>` | `size_t`、`NULL` | `size_t` は 16-bit `int` alias。|
| `<stdarg.h>` | `va_list`、`va_start`、`va_arg`、`va_end` | TS SCC internal ABI 専用。aggregate variadic argument と external ABI は未対応。|
| `<stdio.h>` | `getchar`、`putchar`、`puts`、限定 `printf` / `sprintf` | stream / file I/O、scanf family、width/precision/float format は未対応。|
| `<stdlib.h>` | `EXIT_*`、`abs`、`atoi`、`exit`、`rand`、`srand` | heap、environment/process、search/sort、long / floating / multibyte conversion は未対応。|
| `<string.h>` | `memcpy`、`memmove`、`memset`、`memcmp`、copy/concat/compare/search/span/tokenize、C locale `strcoll` / `strxfrm` | `strerror` と locale/multibyte support は未対応。|

この表にない ISO C headers（`<errno.h>`、`<float.h>`、`<locale.h>`、`<setjmp.h>`、`<signal.h>`、`<time.h>` 等）は
bundled header として提供しない。対応を追加する際は header 宣言だけでなく、runtime archive、packaged asset、CP/M source-path
runtime evidence を同時に追加する。

## Prebuilt CRT and archive library

構造化 runtime は build 時に source runtime を target output directory へ再生成しない。package に
同梱された prebuilt CRT REL と archive を linker へ渡す。lite は platform CRT だけ、full は同じ
platform CRT と `libmz80c-full.lib` を使用する。MSX CRT は exit mode ごとに分かれる。full archive は
`mz80c-stdlib`、`mz80c-string`、`mz80c-ctype`、`mz80c-stdio` の4 REL member で構成し、linker は必要な
export を持つ member だけを抽出する。

| Selection | CRT artifact | library artifact |
| --- | --- | --- |
| `cpm` / `lite` | `cpm-lite-crt.rel` | なし |
| `cpm` / `full` | `cpm-lite-crt.rel` | `libmz80c-full.lib` |
| `msx-bios` / `lite|full` | `msx-bios-lite-halt-crt.rel` または `msx-bios-lite-return-crt.rel` | full のみ `libmz80c-full.lib` |
| `raw` / `lite|full` | `raw-lite-crt.rel` | full のみ `libmz80c-full.lib` |

archive format は `@mz80/core` の `MZ80AR1` だけであり、system の `.a` / vendor `.lib` 互換を
意味しない。legacy `cpmcrt` / `cpmlibc` は compatibility のため従来どおり source-to-REL build を
維持する。`runtimeObject` を structured runtime と併用した場合は CRT path だけを置換し、full archive
は引き続き自動 link される。

bundled `<stdio.h>` から full profile で include された `printf` / `sprintf` だけを TS compiler
の internal variadic ABI provider として扱う。任意の external variadic declaration、external
Z80SCC との variadic ABI 互換、aggregate variadic argument は対象外である。width、precision、
length modifier、float、allocation、file I/O は対象外である。

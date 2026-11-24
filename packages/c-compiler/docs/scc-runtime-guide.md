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

## Optional numeric modules (N1)

TS compiler では fixed と bcd を個別に opt-in できる。lite/full の既定はどちらも無効。
external Z80SCC と legacy runtime alias での利用には対応しない。

```text
mz80 cc numeric.c numeric.com --compiler ts --runtime-platform cpm --runtime-profile lite --runtime-feature fixed --runtime-feature bcd --com
```

project は cc.runtime.features: [fixed, bcd]、compileSccProgram は runtime.features、
compileCFile / compileCSource は features を指定する。後者は REL だけを生成するため、
link 時には getBundledRuntimeArtifacts の対応 archive を渡す。
選択した header path と MZ80_FEATURE_FIXED / MZ80_FEATURE_BCD が自動注入される。
未同梱・未知の module と未選択 provider の呼出しは診断する。

| Feature / header | 型と格納 | 現在の API | 独立 archive |
| --- | --- | --- | --- |
| fixed / `<mz80_fixed.h>` | mz80_q8_8: 2 bytes、mz80_q16_16: 4 bytes、little endian | mz80_q8_* / mz80_q16_*: from_int、to_int、add/sub/mul/div、compare、parse、format | libmz80-fixed-v1.lib |
| bcd / `<mz80_bcd.h>` | mz80_bcd: 符号 + packed BCD 8 bytes、小数4桁 | mz80_bcd_*: from_int、to_int、add/sub/mul/div、compare、parse、format | libmz80-bcd-v1.lib |

各関数は int status を返し、出力先の pointer と入力を受け取る。
Q8.8 constructor の整数範囲は -128～127。Q16.16 と BCD は16-bit signed int 全域に対応する。
成功は MZ80_NUM_OK、Q8.8 範囲外は MZ80_NUM_OVERFLOW、NULL 出力は MZ80_NUM_INVALID。
エラー時は出力を変更しない。共通 status 定数は `<mz80_numeric.h>` にある。
API 名は header で version 付き export へ接続する。heap と共有 mutable storage は使わない。

```c
#include <mz80_fixed.h>
mz80_q16_16 result;
int main(void) {
    return mz80_q16_from_int(&result, -7);
}
```

上記は両 TS ABI から利用できる。static-frame caller は global/static object の pointer を渡す。
automatic aggregate frame と aggregate 値渡しは A1.1 の対象外。
fixed の全9 API family を実装済み。mul/div・to_int・parse は0方向切捨て、overflow / 除数0 / NULL /
容量不足では出力を変更しない。out==left / out==right の完全一致を許可する。partial overlap は契約外。
compare は int *order に -1/0/1 を書き、status と分離する。
parse の文法は `[+-]?[0-9]+(\.[0-9]+)?`、空白・exponent・`.5`・`1.` は INVALID。
format は正確な有限十進表現を NUL 終端で返し、不要な小数末尾0は付けない。
Q8.8 は14 bytes、Q16.16 は24 bytes の buffer で全範囲を扱える。
例えば raw の最小正値は Q8.8 が `0.00390625`、Q16.16 が `0.0000152587890625` となる。
BCD の全9 API family も実装済み。mul/div・to_int は0方向切捨て、overflow と除数0を検出する。
sign は0/1、全 nibble は0～9を要求し、それ以外は INVALID。入力の負のゼロは受理し、結果を plus zero に正規化する。
BCD parse の文法は fixed と共通だが、小数5桁以上は末尾0でも PRECISION とする。
format は常に小数4桁、最大19 bytes（NUL 込み）。to_int は signed 16-bit の範囲外なら OVERFLOW。
エラー時の出力保持、完全一致 alias、NULL、buffer 契約も fixed と共通。

[固定小数点による連立方程式](examples/fixed-equations.c) は両 ABI、lite/full、prebuilt/source-runtime で
`2*x+y=6.5, x-y=1` を解き、`2.5` と `1.5` を出力する。
生成コードは共有可変領域・heap を使わず、public entry 後の追加 stack 上限は fixed 87 / BCD 110 bytes。
API ごとの内訳と再現コマンドは [numeric design](scc-numeric-design.md) を参照する。

[numeric probe](examples/numeric-probe.c) は両 module の全 API family を CP/M / raw / MSX で実行する。
test:msx-numeric は openMSX/C-BIOS_MSX1 で4選択 × lite/full × 両 ABI × halt/return を検証する。
ROM の page 2 選択、初期 DATA の RAM copy、writable BSS は probe が供給する（汎用 CRT の自動初期化ではない）。
return は caller へ戻り、halt はその場で停止する。expanded-slot cartridge はこの startup の検証範囲外。
test:numeric-builds は4配布構成の clean-install 先で constructor・演算・format を実行し、
未同梱 feature の拒否と物理的に縮小した source からの再buildを検証する。

配布自体を縮小する場合は build/pack 時の環境変数 MZ80_NUMERIC_MODULES を
none、fixed、bcd、fixed,bcd のいずれかにする。既定は両 module の asset を同梱するが、利用時は無効。
copy は未選択 module の source/header を除外し、archive も生成しない。
prepack も同じ環境変数を引き継ぐ。復元手順と検証範囲は [numeric design](scc-numeric-design.md) を参照する。

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
`strtok` は C89 と同じ static continuation state を使うため reentrant ではない。`qsort` /
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
| `<stdlib.h>` | `EXIT_*`、`abs`、`atoi`、`exit`、`rand`、`srand`、`malloc`、`free`、`calloc`、`realloc` | environment/process、search/sort、long / floating / multibyte conversion は未対応。|
| `<string.h>` | `memcpy`、`memmove`、`memset`、`memcmp`、copy/concat/compare/search/span/tokenize、C locale `strcoll` / `strxfrm` | `strerror` と locale/multibyte support は未対応。|

この表にない ISO C headers（`<errno.h>`、`<float.h>`、`<locale.h>`、`<setjmp.h>`、`<signal.h>`、`<time.h>` 等）は
bundled header として提供しない。対応を追加する際は header 宣言だけでなく、runtime archive、packaged asset、CP/M source-path
runtime evidence を同時に追加する。

## Prebuilt CRT and archive library

構造化 runtime は build 時に source runtime を target output directory へ再生成しない。package に
同梱された prebuilt CRT REL と archive を linker へ渡す。features=[] の lite は platform CRT だけ、full は同じ
platform CRT と `libmz80c-full.lib` を使用する。MSX CRT は exit mode ごとに分かれる。full archive は
`mz80c-stdlib`、`mz80c-string`、`mz80c-ctype`、`mz80c-stdio`、`mz80c-heap` の5 REL member で構成し、linker は必要な
export を持つ member だけを抽出する。
fixed / bcd を選択すると、profile に関わらず対応する独立 numeric archive を追加する。

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

## Runtime source and artifact ownership

### Static-frame caller

`mz80 cc main.c main.com --compiler ts --ts-abi static-frame --runtime-platform cpm --runtime-profile lite --com`
で A1.1 の固定 frame profile を利用できる。project は `cc.compiler: ts` / `cc.tsAbi: static-frame` を指定する。
runtime 自体は stack ABI を保持し、caller が限定 bridge を生成する。
ABI 混在の preflight は compile program と project build で実行する。
詳細な MVP 制限は [static-frame design](scc-ts-static-frame-abi-design.md) を参照する。

runtime の編集入口は [ownership README](../dist/scc/runtime/README.md) である（正本は `src/scc/runtime/README.md`）。`src/scc/runtime`
には platform CRT source、legacy CP/M alias、full library source、bundled header を置く。package build は
この directory を `dist/scc/runtime` へ copy した後、prebuilt CRT REL と full archive を生成する。

生成済みの `dist/scc/runtime/artifacts` は source of truth ではない。runtime source を変更した場合は
`pnpm -C packages/c-compiler run build` で artifact を再生成し、source-path CP/M test と runtime artifact
test を更新する。full archive は `lib/stdlib.scc.asm`、`lib/string.scc.asm`、`lib/ctype.scc.asm`、
`lib/stdio.scc.asm` から作る。member 境界と export symbol は `runtimeLibrary.ts` の manifest で管理する。
public runtime selection と artifact name はこの source layout から独立して維持する。

bundled `<stdio.h>` から full profile で include された `printf` / `sprintf` だけを TS compiler
の internal variadic ABI provider として扱う。任意の external variadic declaration、external
Z80SCC との variadic ABI 互換、aggregate variadic argument は対象外である。width、precision、
length modifier、float、file I/O は対象外である。

## Heap (H1 complete)

full profile では application 提供 arena を `mz80_heap_init(void *base, size_t bytes)` で初期化し、
`malloc` / `free` / `calloc` / `realloc` を使える。init は mz80.h、allocation API は stdlib.h に宣言する。
init 前・size 0・負値・枯渇時は NULL。free(NULL) は no-op。
2-byte alignment、4-byte block header、split/coalesce に対応し、最大 arena size は 32767 bytes。
arena の stack/code との重なりは caller が回避する。ISR と同時呼出しは禁止。
calloc は積の overflow を検査し、成功時に要求 byte 数を 0 で初期化する。
realloc(NULL,n) は malloc、realloc(p,0) は free 後 NULL。縮小・隣接拡張・移動に対応し、
失敗時は元の block と内容を保持する。

mz80.h の `mz80_heap_set_debug(1)` で検査を有効にする（既定 off）。
`mz80_heap_check()` は常時利用でき、正常 1、未初期化/破損 0。
debug 有効時の二重解放、不正 payload pointer、metadata/free-list 破損は selected CRT の exit(1) で停止する。
debug off の invalid pointer / double-free には回復保証がない。
CP/M/raw の両 caller ABI、openMSX/C-BIOS の両 ABI × halt/return、tarball clean install で heap の 4 API を検証済み。
MSX ROM では allocator DATA と arena を RAM に置き、startup で DATA を初期化する必要がある。
heap smoke は DATA=C000H、BSS=C100H を使い、専用 test startup で zero DATA を初期化する。
この従来 smoke は互換検証用として維持する。通常の TS C build では下記の設定付き startup も使える。

## Configured memory and startup (T2/T3)

`compileSccProgram` の memory、project の link.memory で code/RAM と stack/heap の予約を指定する。
memory 指定時の TS + structured runtime は、entry 前に SP 設定・DATA copy・BSS clear を行う CRT を生成する。
`cc.startup.initHeap: true` は full runtime の予約 heap を初期化し、application 側の mz80_heap_init 呼出しを省略できる。
設定を省略した build は従来の CRT / memory 配置を維持する。

```text
mz80 cc startup-probe.c demo.com --compiler ts --runtime-platform cpm --runtime-profile full --target-config cpm-target.json --com --map
mz80 cc startup-probe.c demo.rom --compiler ts --ts-abi static-frame --runtime-platform msx-bios --runtime-profile full --runtime-exit return --target-config msx-target.json --map
```

[CP/M config](examples/cpm-target.json)、[MSX config](examples/msx-target.json)、[C probe](examples/startup-probe.c) を同梱する。
MSX の設定付き cartridge は専用 test harness で ROM を加工する必要がなく、16/32 KiB の AB header と
primary slot の page 2 設定を生成する。DATA は RAM に配置し、初期値は ROM に格納する。
return は caller の SP/IX/IY と page 2 を復元する。expanded-slot cartridge は本 profile の対象外。

link 時に領域範囲、TEXT/DATA/BSS の重複、予約 stack/heap への侵入、ROM load image の超過、
未解決参照を診断し、`.memory.json` に配置を出力する。予約 stack は動的 overflow guard ではない。
startup:false や copyData/clearBss/setStack:false は caller/loader が初期化を供給する場合の明示指定。
詳細な schema、entry/heap/ABI contract、再現手順は [T2/T3 design](scc-target-startup-design.md) を参照する。
詳細は [heap design](scc-heap-design.md) を参照する。

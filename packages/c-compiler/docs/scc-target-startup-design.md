# T2/T3 — メモリ配置と設定付き startup

更新日: 2026-11-24
状態: Slice 1/2/3 完了（3/3、100%）。

## Goal と対象範囲

16-bit flat address space の code/RAM、stack/heap の予約を設定し、実際に抽出された REL v2 の
TEXT/DATA/BSS が収まることを link 時に保証する。ROM では DATA の load address と runtime address を分離する。
TS C compiler の両 ABI から、entry 呼出し前の DATA copy / BSS clear / stack 設定 / opt-in heap 初期化を生成する。
既存設定は変更せず、memory を指定した build だけを対象にする。

3 slice を等分で管理する。工数比や全機種への対応率ではない。

1. memory schema、配置、予約/重複/範囲/relocation 検査、memory report。
2. startup、entry、heap、ABI、API/CLI/YAML の接続。
3. CP/M/raw/openMSX、通常/縮小 tarball consumer、全回帰、文書/生成物の同期。

bank/far pointer、CUSTOM/ASEG 配置、expanded-slot cartridge、動的 stack overflow guard、
再帰の最大 stack 推定、ISR startup は本 milestone に含めない。

## 公開設定

`@mz80/core` は LinkMemoryLayout / normalizeMemoryLayout を公開する。
`compileSccProgram` は memory と startup、project は link.memory と cc.startup を受け付ける。
CLI `mz80 cc --target-config file.json` は `{memory, startup}` を読み込む。
plain `mz80 link` でも project の link.memory を使えるが、CRT は自動生成しない。

```yaml
cc:
  compiler: ts
  tsAbi: static-frame
  runtime: {platform: cpm, profile: full}
  startup: {entry: program_entry, initHeap: true}
link:
  com: true
  memory:
    code: {start: 100H, size: 8000H, kind: ram}
    ram: {start: 100H, size: EF00H}
    stack: {top: EF00H, size: 400H}
    heap: {start: D000H, size: 800H}
targets:
  demo:
    output: build/demo.com
    modules: [startup-probe.c]
```

数値は整数、十進文字列、0x hexadecimal、suffix H を受理する。領域終端は exclusive。
未知の memory / range / startup field、不正数値、空領域、64 KiB 超過を診断する。
stack.top=65536 は SP=0 として符号化し、stack の予約自体は最上位 RAM 内に置く。

- code.kind=ram: code 全域が RAM に含まれること。DATA は既定で TEXT の後、BSS は DATA の後。
- code.kind=rom: ROM/RAM は非重複。DATA は RAM 先頭、BSS はその後。初期 DATA は TEXT 末尾の ROM に格納する。
- stack: [top-size, top) を予約する。アプリの TEXT/DATA/BSS と heap が侵入してはならない。
- heap: 明示 start/size の optional RAM 予約。未指定なら allocator のための領域を勝手に確保しない。
- 既存 orgText/orgData/orgBss は引き続き使え、最終配置で検査する。既存予約へ侵入したら build を拒否する。
- 配置の alignment gap を含む DATA/BSS の初期化区間も検査し、予約 heap を clear/copy しない。
- COM は RAM code の100H開始に限定する。ROM image は code 領域のサイズまで0で paddingする。
- binFrom/binTo による loadable section の切捨て、ROM 領域外への出力を拒否する。
- memory mode は unresolved extern/relocation と linker 定義 symbol の再定義を error にする。

link.memory は target 指定で全体を置換する。cc.startup の object は global/target の field を mergeし、
false は startup 生成を無効化する。

## 出力と linker symbols

memory 指定時は binary と同じ basename の `.memory.json` を必ず出力する。
code/ram、stack/heap の予約、実使用 TEXT/DATA/BSS の start/size、DATA の loadAddress が含まれる。
map/sym/source map は runtime address を使い、binary/DMP は load address を使う。

startup と user assembly は次の link-time constant を参照できる。

```text
__MZ80_TEXT_START / __MZ80_TEXT_SIZE
__MZ80_DATA_START / __MZ80_DATA_SIZE / __MZ80_DATA_LOAD
__MZ80_BSS_START / __MZ80_BSS_SIZE
__MZ80_STACK_START / __MZ80_STACK_TOP / __MZ80_STACK_SIZE
__MZ80_HEAP_START / __MZ80_HEAP_SIZE
```

heap 未指定は start/size=0。ABS symbol は C の変数を意味しないため、通常の extern int として読まない。
設定付き C startup は heap pointer/size を正しく H1 API に渡す。

## Startup contract

memory があり startup を省略した C build は既定の設定付き startup を生成する。
runtime は structured runtime、compiler は TS を要求する。外部 SCC の ABI 保証は対象外。
project の runtimeObject override と自動生成の併用は拒否する。

| option | 既定 | 動作 |
| --- | --- | --- |
| entry | main | export された int(void)。static-frame の version 付き entry にも対応 |
| setStack | true | 予約領域上端へ SP を設定。raw reset では古い SP に一切 push しない |
| copyData | true | DATA_LOAD → DATA_START、DATA_SIZE bytes。サイズ0は skip |
| clearBss | true | BSS_START から BSS_SIZE bytes を zero。サイズ0は skip |
| initHeap | false | full runtime の予約 heap を mz80_heap_init に渡す |
| msxCartridge | false | MSX primary-slot 16/32 KiB cartridge の header と必要な page 2 設定 |

setStack=true は少なくとも16 bytesの予約を要求するが、プログラムが使う最大 stack を保証する数値ではない。
利用者は numeric runtime、深い call、再帰等に必要な容量を設定する。setStack=false は caller の有効な SP が前提。
startup:false は既存 CRT または application-owned 初期化を使う明示指定であり、C の DATA/BSS 初期化を利用者が担う。
copyData/clearBss の false も外部 loader 等が初期化を供給する場合のために用意する。

initHeap は非ゼロ・偶数 base、偶数 size=6..32766、end<65536 の H1 arena を要求する。
予約だけなら lite でも使えるが自動 allocator 初期化は full 専用。heap init に失敗したら entry を呼ばず haltする。
entry の return 値を exit へ渡す。raw exit hook も HL に status を受け取り、hook が戻った場合は haltする。

MSX return は、元の SP と IX/IY を保存し、初期化後の BSS に復帰用 SP を記録する。
32 KiB primary-slot ROM は BIOS RSLREG/ENASLT で page 2 を選択し、return 時に元へ戻す。
呼出し元の stack は DATA/BSS/heap 等のアプリ領域に含めない。配布例は RAM を C000H..EFFFH に限定する。
割込み mode、AF/BC/DE、expanded-slot mapping の包括的な保存はこの契約に含めない。

## 再現例

[startup probe](examples/startup-probe.c) は DATA/pointer、BSS、heap、optional numeric を実行する。
[CP/M target](examples/cpm-target.json) と [MSX target](examples/msx-target.json) はそのまま CLI に渡せる。

```text
mz80 cc startup-probe.c demo.com --compiler ts --runtime-platform cpm --runtime-profile full --target-config cpm-target.json --com --map
mz80 cc startup-probe.c demo.rom --compiler ts --ts-abi static-frame --runtime-platform msx-bios --runtime-profile full --runtime-exit return --runtime-feature fixed --runtime-feature bcd --target-config msx-target.json --map
pnpm -C packages/c-compiler run test:msx-startup
pnpm run check:pack
```

## 受入条件と検証

- [x] linker の配置、ROM DATA relocation、予約/範囲/重複/未解決参照を unit test で検証する。
- [x] DATA pointer、poisoned BSS、heap、entry、空区間を CP/M/raw・両 ABI で実行する。
- [x] MSX caller の SP/IX/IY 復元と raw の未設定 SP を実行検証する。
- [x] YAML と CLI target-config、custom CRT の拒否を検証する。
- [x] openMSX の16/32 KiB × 両 ABI × halt/return で、生成 ROM を加工せず実行する。
- [x] full/reduced tarball の consumer で設定付き startup を実行する。
- [x] 全回帰、型検査、root build、boundary/docs/pack、生成物・Feature Plan の同期を完了する。

初回検証: memoryLayout 14 tests、startup 10 tests、CLI 統合3 tests が成功。
openMSX の8構成では出力に加え、BIOSへの復帰点でSP/IX/IY/page 2が元に戻ることを確認する。

最終検証（2026-11-24。openMSX 実行は同一実装で2026-11-19に確認）:

| 検査 | 結果 |
| --- | --- |
| core typecheck / 全回帰 | 16 suites / 85 tests pass |
| c-compiler typecheck / 全回帰 | 22 suites / 1072 tests pass |
| CLI typecheck / 全回帰 | 4 suites / 14 tests pass |
| openMSX configured startup | 16/32 KiB × 両 ABI × halt/return、8構成 pass |
| test:numeric-builds | none / fixed / bcd / both の clean-install 先で、設定付き startup を両 ABI で実行。source欠落 build と通常配布への復元も pass |
| check:pack | root build、4 package の型/asset/API、installed CLI --target-config 両 ABI、project、DAP pass |
| versions / boundaries / docs / git diff --check | pass |

配布検証の起動コードはファイルとして実行し、Windows shell の複数行 -e 引数に依存しない。
root build により配布用 dist も同期済み。COM/RAM と raw ROM、MSX primary-slot ROM が本 milestone の実行範囲。

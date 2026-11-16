# `ts-static-frame` ABI design

更新日: 2026-11-16

## Decision summary

`ts-static-frame` は、既定のリエントラント `ts-internal` ABI を置き換えない opt-in code-generation
profile である。MVP は **一つの translation unit 内の direct scalar/pointer call** を static frame
化する。既存 bundled runtime への呼出しだけは、compiler が提供する outbound `ts-internal` bridge を
経由する。

この制限により、stack frame ABI を維持したまま小規模 target 向けに function activation の RAM 使用量を
静的に確定できる。profile は user function 間で混在させず、未対応の call edge は診断する。

## Goals

### A1.1 実装状況

限定 MVP は Core / Public integration / Completion の 3 slice が完了（100%）。
検証: C compiler 935 tests、CLI/project 関連 10 tests、型検査・build・package boundary・文書リンク・差分検査が成功。

adapter の `new TsSccCompilerAdapter({ abi: "ts-static-frame" })` から選択可能。
scalar / object-pointer local、direct call、call graph cycle 診断、限定 runtime bridge を実装済み。
CP/M 実行テストで char/int 引数、pointer local、3 段呼出し、同じ callee の nested argument、
繰り返し呼出し、legacy outchar と structured putchar/puts を検証する。

現段階の frame は既存 layout offset を保持する一つの BSS block で、local bytes + 2 + parameter count × 2
を予約する。2 bytes の gap と char parameter slot の未使用 byte は後続の compact layout 化の対象である。
argument は左から評価して一時 stack に退避し、すべての評価後に逆順 pop で callee slot に配置する。
これにより `f(1, f(2, 3))` の先行引数の上書きを防ぐ。

CLI は `--compiler ts --ts-abi static-frame`、project config は `cc.compiler: ts` と
`cc.tsAbi: static-frame` で選択する。`internal` が既定。project build は複数 C translation unit を拒否する。
公開 entry は `__ts_static_frame_v1_<name>` に変更し、CRT entry の `main` だけ通常名を保持する。
compile program / project build は link 前に REL / archive の externs と定義を照合し、通常 ABI の名前で
static-frame-only 関数を呼ぶ組合せを ABI mismatch として拒否する。
単体 `core.link` を直接利用する場合は `validateTsAbiLinkInputs` を先に呼ぶ。
手書き assembly が version 付き symbol を意図的に呼ぶ場合や ISR からの再入は検出保証の対象外。
array object は MVP では診断対象。A1.1 はこの限定 contract で完了とし、A1 全体の拡張は継続する。

例:

```yaml
cc:
  compiler: ts
  tsAbi: static-frame
  runtime:
    platform: cpm
    profile: lite
targets:
  demo:
    output: build/demo.com
    modules: [src/main.c]
    link:
      com: true
      orgText: 100H
```

RAM は各 function の local bytes + 2 + parameter count × 2 を合計した BSS 領域。
stack frame の local reserve/release は不要になるが、call return address と式評価 stack、
runtime bridge の argument stack は引き続き消費する。frame overlay による RAM 削減は未実装。

1. function ごとの argument と automatic local storage を BSS の固定 frame に置く。
2. direct non-recursive call の activation RAM を compile 時に算出可能にする。
3. current `ts-internal` の既定動作、public runtime selection、external Small-C compatibility を変えない。
4. `char` (1 byte)、`int` / pointer (2 byte)、byte-packed layout を既存 type model のまま使う。
5. CP/M source-path 実行で local、argument、nested non-recursive call、runtime bridge を検証する。
6. unsupported な再入を静かに誤動作させず、compile-time diagnostic にする。

## Non-goals of the MVP

- indirect function call、callback、function-pointer argument/return
- direct / indirect recursion、相互再帰、interrupt からの呼出し
- aggregate argument / return、aggregate temporary、variadic call / `stdarg`
- external user object との static-frame ABI interoperability
- cross-translation-unit static-frame call。whole-program call graph を導入するまで対象外
- `ts-isr`、`ts-naked`、SDCC / Small-C external ABI profile

これらは機能を削るためではなく、static storage が同時 activation で上書きされないことを MVP で保証する
ための境界である。

## ABI contract

### Profile selection

compiler 内部名は `ts-internal` と `ts-static-frame` とする。既定は必ず `ts-internal` である。

最初の public surface は `TsSccCompilerAdapterOptions` の `abi` とする。CLI / project config へ公開するのは
adapter test と CP/M execution evidence が揃った後の同一 milestone とする。`--compiler sccz80` に対して
この option を受け付けてはならない。

### Static frame layout

function `sum(char a, int b)` の static frame は、translation-unit-unique label を使う BSS data である。

```text
__ts_sf_sum_arg_0     .ds 1   ; char a
__ts_sf_sum_arg_1     .ds 2   ; int b
__ts_sf_sum_local_0   .ds N   ; first automatic local
...                         ; compiler-owned scalar temporaries (if required)
```

- field / slot order は declaration order、alignment / padding は行わない。
- caller は argument expression を通常どおり左から評価し、callee の `arg_N` slot へ値を書き込んでから
  `call sum` を発行する。
- callee は argument / local を BSS label から直接 load/store する。function entry / return で local frame
  の `dec sp` / `inc sp` は発行しない。
- call / return address と expression evaluation temporary のための Z80 stack 使用は残る。したがって
  「non-reentrant」は stack を一切使わない意味ではなく、**activation storage を共有する**意味である。
- scalar/pointer return は既存と同じく `HL`。caller cleanup は static-frame user call には存在しない。

### Runtime bridge

bundled runtime は当面 `ts-internal` ABI のままである。`outchar`、`putchar`、`puts` など compiler が
認識する runtime API だけは、static-frame caller から current stack argument sequence を発行して呼び出す。

- bridge target は bundled header / runtime manifest が与える既知 symbol に限定する。
- user 宣言の `extern` function は bridge target と見なさず、MVP では診断する。
- runtime から static-frame user function を callback として呼び返す経路は許可しない。

この限定 bridge により、CP/M console output を使った実行証跡を保ちつつ、profile 混在を暗黙には許さない。

### Reentrancy rule

- direct call graph は translation unit 内で構築し、self recursion と cycle を診断する。
- indirect call、function-pointer value の call consumer、variadic function definition/call、aggregate call edge は
  static-frame profile で診断する。
- static-frame function は ISR / callback entry point にしてはならない。A2 が専用 contract を導入するまで
  interrupt handler からの呼出しは unsupported である。

## Architecture changes

| Layer | Current responsibility | A1.1 change |
| --- | --- | --- |
| `TsSccCompilerAdapterOptions` | fixture mode の選択 | `abi` profile を保持。既定を `ts-internal` に固定 |
| parser / semantic | function / call type を決定 | profile-specific unsupported call edge を診断 |
| `tsFrontendLowering.ts` | bound function を `FunctionIR` へ lower | static-frame storage label と direct-call metadata を渡す |
| `tsProgram.ts` | stack frame layout と call emission | ABI-strategy を導入し、stack slot と BSS slot の load/store/call を分岐 |
| `ProgramSpec` | code/data/bss/function の出力 | frame BSS declaration と generated extern を安全に追加 |
| `TsSccCompilerAdapter` / CLI | TS backend を選択 | evidence 後に `--ts-abi` と project config を公開 |
| runtime | current stack ABI API | runtime bridge symbol allowlist を供給。runtime binary は変更しない |

`tsProgram.ts` は現在 `SP + offset` と `stackDelta` を直接扱うため、MVP の中心は slot access と call
emission を ABI strategy に分離することである。source parser や current type model を fork してはならない。

## Work breakdown

### A1.1-P0 — Contract and rejection tests

- ABI profile type、default、diagnostic wording を定義する。
- recursion / indirect call / variadic / aggregate / external-user-call の reject fixture を先に追加する。
- ABI 文書の compatibility profile table と Feature Plan を `P` に更新する。

### A1.1-P1 — IR and static storage

- function-local BSS frame label naming を translation-unit-unique に定義する。
- scalar/pointer parameter と local の `RefIR` access を stack offset か static label かで lower できるようにする。
- generated frame symbols を `ProgramSpec.bss` と `externs` に接続する。
- function entry / return が frame reservation を発行しない assembly-shape unit test を追加する。

### A1.1-P2 — Direct-call lowering

- direct internal user call で callee argument slot へ store してから `call` する emitter を実装する。
- evaluation order を既定 ABI と同じ左から右に保つ。
- direct call graph cycle detection を実装する。
- allowed runtime symbol への outbound stack bridge を実装する。

### A1.1-P3 — Public configuration and CP/M evidence

- `TsSccCompilerAdapterOptions` から compile path まで profile を伝播する。
- CLI / project config に TS backend 限定の `ts-abi` option を追加し、`sccz80` との組合せを診断する。
- CP/M tests: char/int/pointer argument、local update、3 段 nested call、runtime `outchar` bridge、reject matrix。
- generated `.scc.asm` の slot label、stack reservation 不在、bridge push/cleanup を assertion する。

### A1.1-P4 — Completion review

- current `ts-internal` tests が無変更で通ることを確認する。
- static-frame test program の BSS size と stack usage を報告する。
- binary ABI と runtime guide の boundary を更新し、A1.2 以降（aggregate、callback、ISR）を `P` のまま残す。

## Acceptance criteria

1. `ts-internal` は既定のままで、既存 C compiler test suite が通る。
2. `ts-static-frame` の scalar/pointer direct-call program が CP/M で正しい出力を得る。
3. static-frame function body に automatic local 用 `dec sp` / `inc sp` がなく、BSS frame symbol を参照する。
4. caller が callee argument slot を書き込んでから direct `call` する。
5. runtime bridge が stack ABI を使うことを assembly と CP/M output で確認する。
6. recursion、callback / indirect call、variadic、aggregate、external user call、cross-module call が診断になる。
7. typecheck、build、full package test、`git diff --check` が通る。

## Follow-up milestones

| Milestone | Unlocks | Required additional decision |
| --- | --- | --- |
| A1.2 | aggregate parameter / return | hidden destination and temporary frame slot contract |
| A1.3 | callback / indirect call | target-frame dispatch or explicit trampoline design |
| A1.4 | cross-module direct call | whole-program call graph / linker metadata |
| A2 | ISR ABI | target interrupt vector, nesting, register contract |
| H1 | heap | allocator entry ABI and ISR allocation policy |

## Adopted implementation decisions

実装で次を採用した。

1. MVP を **translation-unit-only** に限定する。
2. runtime bridge は bundled `outchar` / `putchar` / `puts` / `getchar` / `exit` の最小集合から開始する。
3. user-facing option 名を `--ts-abi internal|static-frame` とする。
4. A1.1 完了後は H1 heap へ進み、A1.2 以降は heap の必要性が生じた時点で再評価する。

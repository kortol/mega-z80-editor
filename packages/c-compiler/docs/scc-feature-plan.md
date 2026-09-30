# SCC Feature Plan

日付: 2026-09-30

## 基準状態

固定 `char`（8-bit）/ `int`（16-bit）の C Subset と内部 TS ABI は完了している。bundled runtime
は CP/M、MSX BIOS、raw を `lite` / `full` profile で提供する。以下はこの完了判定を取り替える
ものではなく、その後の拡張計画である。

- 既定の `ts-internal` stack-frame ABI は維持する。これはリエントラントで、再帰と callback を支援する。
- platform 非依存 library code を CRT および platform I/O から分離する。
- header、runtime、配布 artifact、source-path CP/M 実行証跡を同じ変更で追加する。宣言だけでは
  対応済み feature と見なさない。
- 固定 8/16-bit data model を暗黙に広げない。新しい number type と ABI は明示的な opt-in profile とする。

## 作業ストリームと依存関係

```text
R0 Runtime のリポジトリ再編成
 |-- A1 ABI profile（static-frame、ISR、naked）
 |-- H1 Heap 基盤
 |     `-- L1 allocation を必要とする C library 拡張
 `-- N1 数値基盤（fixed point / BCD）
        `-- F1 IEEE-754 binary32 C float
               `-- L2 書式 I/O と数値変換
```

`R0` を最初に置く。allocator と数値 module を増やす前に、source の所有範囲と artifact の構築
経路を明確にするためである。その gate 後は `A1`、`H1`、`N1` を独立して進められる。

## R0 — Runtime のリポジトリ再編成

### 目的

公開 CLI option や出力 ABI を変えずに、source、header、platform CRT、共通 library、生成 artifact を
それぞれ独立して理解できる構造にする。

### タスク

- `src/scc/runtime` を `crt/`、`platform/`、`lib/`、`include/`、生成 `artifacts/` の入出力という
  論理的な source group に分割する。
- 現在 `full.scc.asm` に集約されている library member を、`lib/string`、`lib/ctype`、`lib/stdio`、
  `lib/stdlib` などの focused module へ移す。
- artifact build script に明示的な member manifest を持たせ、archive 順序を再現可能にする。
- `cpmcrt` / `cpmlibc` compatibility alias と、structured な `cpm`、`msx-bios`、`raw` selection を維持する。
- source-to-artifact の所有関係と local test command を architecture / contributor 文書へ追加する。

### 受入条件

- 可能な場合は byte-identical artifact、それ以外では export symbol と CP/M 実行挙動が同一である。
- 既存の 3 platform、2 profile、MSX の両 exit mode を引き続き解決できる。
- package 全 test、typecheck、build、`git diff --check` が通る。

## A1 — ABI profile

### A1.1 `ts-static-frame`（非リエントラント ABI）

再帰よりも速度と RAM 使用量の予測可能性を優先する小規模 memory target 向けに、opt-in ABI を提供する。

- argument と local slot を call stack ではなく、function ごとの fixed frame に配置する。
- 直接/間接 recursion を診断し、caller が排他を提供しないかぎり interrupt から呼び出せないことを文書化する。
- aggregate の値渡し/戻り値、一時領域、variadic policy を明示的に定義する。未定義部分を
  `ts-internal` から偶然継承してはならない。
- 生成済み bridge stub がない ABI profile の混在は linker/compiler diagnostic にする。

### A1.2 `ts-isr` と `ts-naked`

- `ts-isr`: 定義済み register set を保存し、`reti` を使う。既定では unsafe runtime call を禁止し、
  nesting policy を明記する。
- `ts-naked`: compiler prologue / epilogue を出さない。文書化された assembly boundary だけを提供し、
  ABI 保存は user の責任とする。

### 受入条件

- CP/M test で通常 call、aggregate call、禁止された recursion、ABI mismatch diagnostic を覆う。
- ISR / naked の assembly-shape test で正確な prologue / epilogue contract を検証する。
- 各 profile に version 付き ABI 文書と interoperability matrix がある。

## H1 — Heap 基盤

### 目的

platform OS allocator を仮定せず、`full` runtime に opt-in かつ deterministic な heap を追加する。

### タスク

- target が供給する arena（`base`、`size`）と、その選択用の optional linker / CLI 設定を定義する。
  `lite` は allocation-free のままとする。
- `malloc`、`free`、`calloc`、`realloc` を実装し、alignment、zero-size allocation、失敗時の `NULL`、
  double-free policy、fragmentation 挙動を定義する。
- 最初は小さな coalescing free-list allocator を採用する。diagnostics / statistics hook は通常 ABI を
  小さく保つため debug profile でのみ有効化する。
- interrupt context から allocation しないことを保証し、`ts-static-frame` / `ts-isr` との関係を文書化する。

### 受入条件

- CP/M source-path test が allocation、reuse、coalescing、`calloc` の zeroing、`realloc` の
  preservation / failure、exhaustion を覆う。
- raw runtime test が hard-coded I/O や platform address なしに、設定済み arena を使うことを証明する。
- debug build では heap corruption と double-free が deterministic diagnostic になり、release policy が
  文書化されている。

## L1 — C library 拡張

### 範囲

対象は明示的に文書化された C89 指向 fixed-ABI library であり、hosted ISO C environment 全体を実装済みと
主張するものではない。

### 計画する増分

- allocation 依存の `<stdlib.h>`: `qsort`、`bsearch`、H1 の heap API。`qsort` comparator ABI は実装前に定義する。
- `<string.h>`: `strerror` は error model 決定後にだけ追加する。locale を別途承認しないかぎり、既存の
  ASCII / no-locale 境界を維持する。
- `<stdio.h>`: code-size cost を受容できる場合に限り、float を必要としない format parsing 改良（`width`、
  `precision`、integer length policy）を先に追加する。file / stream I/O は platform-service project として分離する。
- error model: `errno` を global、ABI-profile-local、未提供のいずれにするか決め、diagnostic text に依存しない
  最小 `assert` / panic hook を提供する。
- platform-service adapter: portable C stream と偽装せず、CP/M BDOS と MSX BIOS wrapper を `<mz80.h>` API として追加できる。

### 明示的に延期するもの

`locale`、multibyte / wide character、process environment、signal、time、`setjmp`、hosted file stream は別
proposal のままとする。これらを fixed-ABI library scope の未完了として進捗に数えない。

### 受入条件

- 追加する各 function に header、archive member、linker extraction test、CP/M source-path execution test がある。
- library profile と未対応 corner case を、同じ変更で `scc-runtime-guide.md` に追加する。

## N1 — 数値基盤: fixed point と BCD

### 目的

C scalar type system を変更する前に、有用な十進算術と小数算術を提供する。

- signed `q8_8`、`q16_16` などの opt-in library type を追加し、saturation / overflow と rounding rule を明示する。
- BCD は C `float` ではなく十進 library type / API として扱う。packed / unpacked representation、precision、
  sign、conversion、arithmetic helper ABI を定義する。
- compiler type extension を意図的に承認するまで、これらの値は aggregate または named library type とする。

### 受入条件

- deterministic CP/M vector が negative value、overflow、rounding、decimal conversion を覆う。
- host reference implementation で cross-check vector を生成するが、test data は固定値として commit する。

## F1 — IEEE-754 互換浮動小数点

### 判断ゲート

実装前に初期 C floating profile を一つ選ぶ。推奨する最初の profile は software IEEE-754 binary32 `float`
である。`double` は ABI、code size、test cost を別途承認するまで未対応とする。BCD は IEEE の代替ではなく、N1 に残す。

### 必要な compiler 作業

- floating literal、declaration、conversion、usual arithmetic conversion、comparison、constant folding semantics を追加する。
- calling convention、return register / temporary slot、structure layout への影響、varargs promotion、全 ABI profile
  との相互作用を規定する。
- arithmetic / conversion operation を、NaN、infinity、signed zero、rounding、overflow、divide-by-zero の挙動を定義した
  software runtime へ lower する。
- numeric ABI が安定した後にだけ `printf` / `sprintf` を拡張する。最初の arithmetic milestone に `%f` format は含めない。

### マイルストーン

1. arithmetic なしで binary32 値を parse / store / pass / return する。
2. runtime helper による arithmetic と comparison。
3. integer conversion と deterministic constant folding。
4. optional な decimal formatting / parsing と選択済み `printf` format。

### 受入条件

- CP/M execution test と host-generated IEEE edge-case vector がある。
- ABI test が nested call、aggregate field、function pointer、variadic promotion 境界を覆う。
- 各 intermediate milestone で、未対応の `double`、format、math-library function を公開 exclusion list に明記する。

## 推奨する提供順序

1. 現在の C Subset / internal-ABI 完了基準を独立して commit する。
2. semantic feature を変えない R0 を提供する。
3. 最初の新 ABI profile として A1.1（`ts-static-frame`）を提供する。
4. H1 と、allocation 依存部分の L1 を提供する。
5. すぐに有用な数値 program 向けに N1 fixed point / BCD を提供する。
6. binary32 profile と ABI contract 選択後に F1 を開始する。

各提供の完了には source、生成 distribution artifact、文書、実行証跡が必要である。進捗率はその提供で受け入れた
task だけを母数とし、意図的に延期した hosted C facility を含めてはならない。

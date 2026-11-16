# SCC Feature Plan

更新日: 2026-11-17

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

## 全体 Feature List

この一覧は「ISO C 全体を無条件に実装する」backlog ではない。各項目は採用時に C Subset matrix、
binary ABI、runtime guide、実行証跡までを同時に更新する。状態の意味は次のとおり。

| 状態 | 意味 |
| --- | --- |
| `完了` | 現行の fixed 8/16-bit scope で実装・文書化・実行検証済み |
| `候補` | 実装価値はあるが、採否または contract の決定が必要 |
| `進行中` | 採用済みで、一部 delivery slice の実装・検証が完了 |
| `保留` | 依存する feature / platform contract の後に検討する |
| `対象外` | 現行 product scope では採用しない。必要になれば独立 proposal とする |

### 1. 言語フロントエンドと型モデル

| ID | Feature | 状態 | 主な依存 / 判断 |
| --- | --- | --- | --- |
| C0 | fixed `char` / `int`、pointer、aggregate、fixed array、function pointer、preprocessor subset | 完了 | 現行 C Subset の正本 |
| C1 | 完全な signedness / integer conversion rule | 候補 | `unsigned` / `short` を構文 alias から意味論へ昇格するか |
| C2 | `long` / `unsigned long` | 候補 | 32-bit arithmetic helper、layout、format、ABI が必要 |
| C3 | IEEE binary32 `float` | 保留 | F1。software arithmetic、ABI、conversion を含む |
| C4 | `double` | 保留 | binary32 の code size / ABI 実績後に別判断 |
| C5 | VLA | 保留 | dynamic stack と frame ABI の設計を要する |
| C6 | bit-field / flexible array member | 候補 | layout contract と object model を先に定義する |
| C7 | aggregate lvalue の一般値化 | 保留 | 現在の producer/consumer model を拡張するか判断 |
| C8 | variadic macro、pragma、line-control、system header discovery | 候補 | preprocessor を hosted C へ近づけるか判断 |
| C9 | `_Static_assert`、`inline`、C99/C11 extension | 対象外 | C89-oriented fixed ABI の外。必要時は個別 proposal |

### 2. ABI と低水準コード生成

| ID | Feature | 状態 | 主な依存 / 判断 |
| --- | --- | --- | --- |
| A0 | `ts-internal` stack-frame ABI | 完了 | 再帰、callback、aggregate、internal variadic を含む |
| A1 | `ts-static-frame` 非リエントラント ABI | 候補 | [A1.1 design](scc-ts-static-frame-abi-design.md) で direct-call MVP と禁止範囲を定義 |
| A2 | `ts-isr` interrupt ABI | 保留 | register save、nesting、runtime call policy、target interrupt model |
| A3 | `ts-naked` ABI | 候補 | prologue/epilogue 無しの assembly boundary を定義する |
| A4 | Small-C external object / assembler interoperability | 候補 | 現行 default profile の `P` を外部 object test で確定する |
| A5 | SDCC `__sdcccall(0)` profile | 保留 | argument / return / aggregate rule と interop toolchain が必要 |
| A6 | register preserved / clobbered contract | 候補 | external ABI / ISR / inline assembly の基礎契約 |
| A7 | banked-memory / far pointer ABI | 保留 | 対象機種と linker memory model を先に選ぶ |
| A8 | debug ABI（function name、stack trace、C source location） | 候補 | debug symbol format と CLI/debugger integration を決める |

### 3. Runtime、library、memory model

| ID | Feature | 状態 | 主な依存 / 判断 |
| --- | --- | --- | --- |
| R0 | runtime source / artifact repository organization | 完了 | platform / legacy / lib / include と manifest に整理済み |
| H1 | configured arena と `malloc` / `free` / `calloc` / `realloc` | 完了 | 3/3 slice（100%）。CP/M/raw、openMSX、tarball clean-install で検証 |
| H2 | custom heap diagnostics / statistics | 保留 | H1 の allocator と opt-in debug 検査を基礎とする |
| L1 | `qsort` / `bsearch` | 保留 | H1 と comparator ABI が必要 |
| L2 | `strerror` / minimal `errno` / panic hook | 候補 | global / profile-local / 未提供の error model を決める |
| L3 | `printf` / `sprintf` の width、precision、integer length | 候補 | code size 上限と integer width policy を決める |
| L4 | `scanf` family | 保留 | stream / input error / conversion contract が必要 |
| L5 | file / stream I/O | 保留 | CP/M BDOS、MSX BIOS、raw の共通 abstraction が必要 |
| L6 | locale、multibyte / wide character | 対象外 | fixed ASCII runtime の scope 外 |
| L7 | `setjmp` / `longjmp`、signal、time、environment | 対象外 | target startup / OS contract が未定義 |
| L8 | CP/M BDOS / MSX BIOS service wrapper | 候補 | portable stream とは分離し、`<mz80.h>` API として設計する |

### 4. 数値機能

| ID | Feature | 状態 | 主な依存 / 判断 |
| --- | --- | --- | --- |
| N1 | `q8.8` / `q16.16` fixed point library type | 候補 | overflow / rounding / multiplication division helper を定義する |
| N2 | BCD decimal library type | 候補 | packed representation、精度、sign、conversion、helper ABI を定義する |
| F1 | IEEE-754 binary32 `float` | 保留 | literal / layout / call / return / arithmetic / comparison / conversion を段階導入 |
| F2 | float formatting / parsing、`%f` | 保留 | F1 arithmetic と code-size 評価後 |
| F3 | `math.h` elementary functions | 保留 | F1 と numerical accuracy policy 後 |

### 5. Target、toolchain、開発体験

| ID | Feature | 状態 | 主な依存 / 判断 |
| --- | --- | --- | --- |
| T0 | CP/M、MSX BIOS、raw runtime | 完了 | lite / full profile と MSX exit mode |
| T1 | openMSX smoke の CI 化 | 候補 | emulator / C-BIOS の利用可能な CI runner が必要 |
| T2 | target memory / stack / heap size configuration | 候補 | H1、A1、linker memory model と接続する |
| T3 | target startup customization（entry、BSS、data copy、stack reservation） | 候補 | platform CRT contract を拡張する |
| T4 | C compiler diagnostics の warning level / `-Werror` | 候補 | diagnostic category と CLI option を定義する |
| T5 | C source map と debugger C-level view | 保留 | A8 と debug file format が必要 |
| T6 | example program / compatibility corpus | 候補 | CP/M 実行可能な小規模 program を仕様例として固定する |

### 選定ルール

次に実装する feature は、以下を満たすものから選ぶ。

1. **利用目的**: 実際に作りたい program を一つ以上直接可能にする。
2. **境界の明確さ**: ABI、memory、error、platform 依存が文書で閉じている。
3. **検証可能性**: source-path CP/M runtime test と artifact test を同じ change に追加できる。
4. **段階性**: 既定 `ts-internal` と current runtime を壊さず opt-in で導入できる。

現時点の有力な選択肢は、A1（非リエントラント ABI）、H1（heap）、N1（fixed point）、A4/A6
（external ABI の明文化）の四つである。選択後は対象 item を `候補` から実装 milestone へ分割し、
完了率の母数と受入条件をこの文書で固定する。

## R0 — Runtime のリポジトリ再編成

### 目的

公開 CLI option や出力 ABI を変えずに、source、header、platform CRT、共通 library、生成 artifact を
それぞれ独立して理解できる構造にする。

### タスク

- [x] `src/scc/runtime` を `platform/`、`legacy/`、`lib/`、`include/`、生成 `artifacts/` の入出力という
  論理的な source group に分割する。
- [x] library member を `lib/stdlib.scc.asm`、`lib/string.scc.asm`、`lib/ctype.scc.asm`、
  `lib/stdio.scc.asm` の focused module へ移す。
- [x] artifact build script に明示的な member manifest を持たせ、archive 順序を再現可能にする。
- [x] `cpmcrt` / `cpmlibc` compatibility alias と、structured な `cpm`、`msx-bios`、`raw` selection を維持する。
- [x] source-to-artifact の所有関係と local test command を architecture / contributor 文書へ追加する。

`platform/` は structured runtime の CRT / platform I/O source、`legacy/` は external-SCC 互換 alias、
`lib/` は platform 共通 library source を置く。`tools/copy-runtime.js` は `dist/scc/runtime` を再作成するため、
source 移動後に旧 asset path が package に残らない。

### 受入条件

- 可能な場合は byte-identical artifact、それ以外では export symbol と CP/M 実行挙動が同一である。
- 既存の 3 platform、2 profile、MSX の両 exit mode を引き続き解決できる。
- package 全 test、typecheck、build、`git diff --check` が通る。

## A1 — ABI profile

### A1.1 `ts-static-frame`（非リエントラント ABI）

状態: **A1.1 限定 MVP は 3/3 slice 完了、進捗 100%**（2026-11-16）。
CLI `--ts-abi static-frame`、project `cc.tsAbi`、version 付き entry symbol と REL/archive ABI 混在検出を提供する。
詳細な採用範囲と制限は [A1.1 design](scc-ts-static-frame-abi-design.md) を参照する。

- [x] Core ABI slice: scalar/object-pointer 固定 BSS frame、direct call、runtime bridge、再帰などの拒否診断と CP/M 実行。
- [x] Public integration slice: CLI、YAML config、backend/profile validation、複数 C translation unit 拒否、REL/archive ABI mismatch 検出。
- [x] Completion slice: 仕様・制限・RAM/stack 使用の文書化、生成 artifact 更新、回帰検証。

検証結果: C compiler 16 suites / 935 tests、CLI/project 関連 3 suites / 10 tests が成功。
型検査、core/C compiler/CLI build、package boundary、55 Markdown の local link、差分検査も成功。
この完了率は A1.1 の scalar/pointer direct-call MVP が母数であり、aggregate、callback、ISR、
cross-module static-frame call、frame overlay は含めない。A1 全体の完了を意味しない。

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

状態: Slice 1/2/3 完了、3/3 delivery slice（100%）。
4 allocation API、arena 初期化、split/coalesce、void pointer、header/archive、A1.1 bridge、
heap_check/debug/fail-fast、両 ABI の CP/M 実行を実装済み。
raw 両 ABI、openMSX の heap 両 ABI × halt/return、tarball clean-install の heap 実行も検証済み。
最終結果は C compiler 970 tests、CLI/project 関連 10 tests、MSX smoke 計 8 variant、check:pack が成功。
詳細は [H1 Heap design](scc-heap-design.md)。
初回は application 提供 arena を C API で初期化し、CLI/linker 自動配置は後続とする。
3 slice は使用可能な allocator、4 API/debug contract、platform/配布検証のまとまりで実装する。

### 目的

platform OS allocator を仮定せず、`full` runtime に opt-in かつ deterministic な heap を追加する。

### タスク

- target が供給する arena（`base`、`size`）と、その選択用の optional linker / CLI 設定を定義する。
  `lite` は allocation-free のままとする。
- `malloc`、`free`、`calloc`、`realloc` を実装し、alignment、zero-size allocation、失敗時の `NULL`、
  double-free policy、fragmentation 挙動を定義する。
- 最初は小さな coalescing free-list allocator を採用する。debug 検査は runtime flag で opt-in とし、
  custom diagnostics / statistics hook は H2 で扱う。
- interrupt context から allocation しないことを保証し、`ts-static-frame` / `ts-isr` との関係を文書化する。

### 受入条件

- CP/M source-path test が allocation、reuse、coalescing、`calloc` の zeroing、`realloc` の
  preservation / failure、exhaustion を覆う。
- raw runtime test が hard-coded I/O や platform address なしに、設定済み arena を使うことを証明する。
- debug 有効時は heap corruption と double-free が deterministic fail-fast になり、release policy が
  文書化されている。

## L1 — C library 拡張

### 範囲

対象は明示的に文書化された C89 指向 fixed-ABI library であり、hosted ISO C environment 全体を実装済みと
主張するものではない。

### 計画する増分

- `<stdlib.h>`: `qsort`、`bsearch`、H1 の heap API。search/sort は heap を必須としない。
  comparator ABI は実装前に定義する。
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

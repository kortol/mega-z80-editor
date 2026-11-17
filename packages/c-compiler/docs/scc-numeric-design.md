# N1 Optional 数値 module — Goal と詳細タスク

更新日: 2026-11-18
状態: Slice 1/2/3/4 完了（4/4 delivery slice、100%）。

## Goal

固定小数点と BCD を、それぞれ単独で追加・除外できる runtime extension として提供する。
通常の ts-internal caller と A1.1 static-frame caller から利用でき、heap に依存しない。
既定の lite/full runtime は numeric extension を有効にしない。

完了時に次を実行可能にする。

- fixed のみ: Q8.8 / Q16.16 の四則演算・比較・整数/文字列変換。
- BCD のみ: 符号付き十進数の四則演算・比較・整数/文字列変換。
- 両方: 両 module を同じ program から呼び出せる。
- どちらも不要: numeric header、symbol、code、DATA/BSS が実行 image に入らない。
- 縮小配布: numeric module ごとの source/header/archive を配布物から外しても残る構成を build・利用できる。

C の float/double、operator overloading、C の long 型は導入しない。
数値表現と演算は named object type と function API で提供する。
BCD は初期案では固定小数桁の十進数であり、指数を持つ BCD 浮動小数点とは別の機能である。

## 現状と必要な変更

基準 commit は 6aa8f63（H1 完了）。作業ツリーは設計開始時に clean。

| 現行実装 | N1 で必要な変更 |
| --- | --- |
| char=8、int/size_t/pointer=16 bit | 32-bit 値を byte object として扱い、scalar width は維持 |
| full library は単一 libmz80c-full.lib、5 member | fixed/BCD は別 archive にし、full に含めない |
| runtime selection は platform/profile/exit | opt-in features と提供可能 module の照合を追加 |
| bundled include directory は一つ | core include と選択済み numeric include を組み立てる |
| A1.1 bridge は symbol の固定 allowlist | 選択済み numeric provider のみ bridge を許可 |
| A1.1 は generic walk で aggregate metadata も拒否 | aggregate の値渡しと object-pointer 搬送を区別する |
| copy-runtime は runtime tree 全体を copy | 縮小 build で未選択 module を copy/build しない |
| heap は full の optional archive member | N1 は heap を使わず、lite/full 双方で動作可能とする |

A1.1 の numeric object は最初は global/static object を使う。
automatic aggregate frame、aggregate by-value call/return、callback 対応はこの計画に含めない。
const input pointer と object address を通せるように validator を狭く修正し、既存の拒否テストを維持する。

## Optional module contract

### 利用時の選択

structured runtime の features で選択する。

```yaml
cc:
  compiler: ts
  tsAbi: static-frame
  runtime:
    platform: cpm
    profile: lite
    features: [fixed] # [] / [fixed] / [bcd] / [fixed, bcd]
```

CLI は --runtime-feature fixed / --runtime-feature bcd を繰り返して指定する。
省略は []。full も numeric を自動追加しない。重複は除去し順序を正規化する。
unknown feature、未同梱 module、legacy string runtime との組合せは compile/link 前に診断する。
最初の compiler 対象は TS。external Z80SCC/SDCC への互換保証は別タスクとする。

| Module | Include directory / header | Artifact |
| --- | --- | --- |
| core | runtime/include | 現行 CRT と full library |
| fixed | runtime/numeric/fixed/include/mz80_fixed.h | libmz80-fixed-v1.lib |
| bcd | runtime/numeric/bcd/include/mz80_bcd.h | libmz80-bcd-v1.lib |
| 共通宣言 | core include/mz80_numeric.h | status 定数のみ。実行時 code なし |

各 archive 内も conversion/add/compare/multiply/divide/format などの member に分け、
少数 API を使うだけで全演算が抽出される構造を避ける。
fixed と BCD は相互参照しない。共通 binary helper が必要なら各 module の private symbol として閉じ込める。
heap、stdio、locale、global errno に依存しない。I/O は caller が buffer を puts 等に渡して行う。

runtime feature の selection は include path、define、link input、source-runtime 連結、bridge provider の
すべてに同じ registry から反映する。header 宣言だけを有効にして実装がない状態を作らない。
MZ80_FEATURE_FIXED / MZ80_FEATURE_BCD を有効時のみ注入し、user の再定義を拒否する。

### 配布時の除外

通常の開発/配布 build は両 module の prebuilt asset を生成してよいが、利用時の既定は無効とする。
環境変数 MZ80_NUMERIC_MODULES=none/fixed/bcd/fixed,bcd で縮小配布を選択する。
未指定は fixed,bcd。build と pack/prepack に同じ環境変数を保持する。
package manifest が未同梱 file を必須 import してはならない。

```powershell
$env:MZ80_NUMERIC_MODULES = "fixed"
pnpm -C packages/c-compiler run build
pnpm -C packages/c-compiler pack --pack-destination ./packed
# 通常配布に戻す
Remove-Item Env:MZ80_NUMERIC_MODULES
pnpm -C packages/c-compiler run build
```

copy は core と選択済み directory だけを読み、build は生成された
numeric/available.json にある module だけを archive 化する。
pnpm -C packages/c-compiler run test:numeric-builds は4構成を pack し、source/header/archive の
有無と capability 診断を検証してから通常配布へ戻す。dist を変更するため build/test と直列実行する。

- 選択前に available module manifest を読み、未提供 module を要求したら明示診断。
- core runtime loader は numeric source file を無条件 read しない。
- 固定 whitelist を持つ copy/build で未選択の source/header/archive を除外する。
- 縮小 build を切り替えたとき、古い numeric asset を残さない。
- source を物理的に省略した構成でも、該当 feature を選ばなければ build が成立する。
- npm pack の再buildも選択を維持する手段を提供する。prepack が全 module を復活させない。
- 通常配布へ戻す復元手順も文書化する。

実行 image の削減と tarball の削減を別々に測定する。
通常の pnpm workspace dependency や C frontend に optional numeric module を必須依存として追加しない。

## 数値仕様（fixed / BCD v1 確定）

### Fixed v1

表記は sign bit を整数部に含む。typedef 名だけで C int/long と同一視しない。

| 型 | 格納 | 範囲 | 最小刻み |
| --- | --- | --- | --- |
| mz80_q8_8 | 2-byte little-endian two's complement | -128 ～ 127.99609375 | 1/256 |
| mz80_q16_16 | 4-byte little-endian two's complement | -32768 ～ 32767.9999847412109375 | 1/65536 |

型は byte 配列を内包する named struct とし、sizeof が 2/4 であることをテストする。
add/sub は full-width carry と sign overflow、mul は倍幅 intermediate、div は拡張 numerator を用いる。
mul/div、整数への変換、decimal input の binary 変換は **0 方向への切捨て**。
overflow は検出して destination を保持する。暗黙 saturation/wrap はしない。
raw bytes と整数値を混同させる constructor macro は導入しない。

### BCD v1

v1 は **全16桁・小数4桁**。範囲は -999999999999.9999 ～ +999999999999.9999。
指数は持たない。任意精度・可変 scale・BCD floating point は後続の別形式とする。

格納は sign byte（0=plus、1=minus）と packed BCD 8 bytes の計9 bytes。
各 packed byte は上位 nibble が先行桁、byte 順は最上位の十進桁から並べる。
内部整数値を 10000 で割った値として解釈する。0 の sign は常に plus に正規化する。
sign が 0/1 以外、nibble が 10～15 の入力は INVALID。負のゼロは入力として受理し、結果は plus zero に正規化する。

BCD mul は最大32桁、div は scale 調整分を含む十分な intermediate 桁を予約する。
結果は小数4桁へ 0 方向に切り捨て、整数部 overflow を検出する。
BCD の precision/scale を変更する場合は v1 object を読み替えず、新形式/API として追加する。

## API / error / aliasing

以下の fixed v1 prototype を実装済み。q8_8 と q16_16 は型ごとに同じ API family を持つ。

```c
int mz80_q16_from_int(mz80_q16_16 *out, int value);
int mz80_q16_to_int(int *out, const mz80_q16_16 *value);
int mz80_q16_add(mz80_q16_16 *out, const mz80_q16_16 *a, const mz80_q16_16 *b);
int mz80_q16_sub(mz80_q16_16 *out, const mz80_q16_16 *a, const mz80_q16_16 *b);
int mz80_q16_mul(mz80_q16_16 *out, const mz80_q16_16 *a, const mz80_q16_16 *b);
int mz80_q16_div(mz80_q16_16 *out, const mz80_q16_16 *a, const mz80_q16_16 *b);
int mz80_q16_compare(int *order, const mz80_q16_16 *a, const mz80_q16_16 *b);
int mz80_q16_parse(mz80_q16_16 *out, const char *text);
int mz80_q16_format(char *out, size_t capacity, const mz80_q16_16 *value);
```

BCD は mz80_bcd_* として同じ形を採用する。compare は order に -1/0/1 を書き込み、
status と大小を分離する。fixed API は header macro で v1 専用の version 付き export symbol へ接続する。
CLI/compiler が名前を対応づける場合は user extern の blanket 許可をしない。

| status 定数 | 結果 |
| --- | --- |
| MZ80_NUM_OK = 0 | 成功。結果を destination に書込む |
| MZ80_NUM_OVERFLOW = 1 | 数値範囲外、destination を変更しない |
| MZ80_NUM_DIVZERO = 2 | 除数0、destination を変更しない |
| MZ80_NUM_INVALID = 3 | NULL / malformed input / 不正 BCD、destination を変更しない |
| MZ80_NUM_BUFFER = 4 | format の容量不足、buffer を変更しない |
| MZ80_NUM_PRECISION = 5 | BCD parse の小数桁数超過、destination を変更しない |

出力 pointer と入力 pointer の完全一致はサポートする（out==a、out==b）。
成功前に input を全て読み取り、error 時の出力不変を保証する。部分 overlap は契約外。
scratch は stack または caller-owned temporary を使い、共有 mutable DATA を使わない。
各演算の最大 stack 使用量を記録し、large temporary を heap で確保しない。
ISR からの利用保証は A2 の register/interrupt contract が決まるまで対象外とする。

parse は ASCII の optional sign + digits + optional decimal point/fraction を受け付ける。
fixed の文法は `[+-]?[0-9]+(\.[0-9]+)?`。`.5` と `1.` は INVALID。
量子化は0方向へ切り捨ててから表現範囲を検査する。従って Q8.8 の `127.999999999` は最大値、
`-128.0000000001` は最小値になり、`128` は OVERFLOW。
空文字、空白、exponent、区切り記号、余分な末尾は INVALID。BCD は小数4桁を超える入力を PRECISION とする。
fixed format は binary 値を正確に表す十進文字列、BCD format は小数4桁の文字列とし、NUL を付ける。
format は必要容量を確定してから書込み、buffer-too-small 時の部分出力を避ける。
fixed と BCD の直接変換、printf format 拡張は N1 初期 scope に含めない。

## 詳細タスクと提供単位

### Slice 1 — Optional module 基盤

- [x] registry、feature validation、available manifest、default-off を実装する。
- [x] API/CLI/project の feature 指定、include/define/link input 伝播を実装する。
- [x] numeric の独立 directory/header/archive と source-runtime 連結を接続する。
- [x] 対応 object pointer を A1.1 で通す validator/provider 境界を実装し、by-value 拒否を維持する。
- [x] 最小 constructor API を両 module に用意して、4 selection の compile/link/CP/M probe を通す。
- [x] module 無し / 片方のみの配布 source tree、copy、prepack の除外経路を実装・検証する。

この段階の constructor は module 接続の証跡とし、四則演算対応済みとは数えない。

実装済み API は mz80_q8_from_int、mz80_q16_from_int、mz80_bcd_from_int の3関数。
header の object macro で mz80_q8_v1_from_int 等の version 付き export へ接続する。
Q8.8 は入力 int が -128～127 のとき成功、それ以外は OVERFLOW で出力保持。
Q16.16 と BCD は signed 16-bit int 全域を受け付ける。NULL 出力は INVALID。
constructor の layout は上記2/4/9 bytes とする。BCD 0 は plus に正規化する。
共有 DATA/BSS と heap は使わない。明示的な追加 stack 使用量は fixed 0 bytes、
BCD は最大6 bytes（保存 IX、helper return address、quotient transfer）。caller 引数・外側 return は除く。
Slice 1 時点では module ごとに constructor member が一つ。fixed は Slice 2 で下記10 member に分割した。

検証は numericModules.test.ts に4 selection × lite/full × 両 ABI の16構成、
両 ABI の境界 byte vector、未選択 provider/header の拒否、未使用 archive の非抽出を持つ。
source-runtime 連結経路も lite/full の CP/M 実行で確認する。
CLI/YAML は staticFrameIntegration.test.ts、縮小 pack は test:numeric-builds で検証する。
raw/MSX numeric 実行、tarball clean-install 先での演算実行は Slice 4 に残る。

Slice 1 時点（2026-11-17）の検証結果:

| 検査 | 結果 |
| --- | --- |
| c-compiler typecheck / build | pass |
| c-compiler 全回帰 | 18 suites / 993 tests pass（numeric 22 tests を含む） |
| CLI typecheck / build | pass |
| CLI staticFrameIntegration / project / mz80-cc | 3 suites / 11 tests pass |
| test:numeric-builds | none / fixed / bcd / both の欠落 source copy・prepack・asset/capability 検査 pass。通常配布へ復元済み |
| 実際の CLI | --runtime-feature を2回指定した static-frame CP/M program が AA を出力し正常終了 |
| boundary / docs / git diff --check | pass |

### Slice 2 — Fixed を実用化

- [x] Q8.8 / Q16.16 layout、status、rounding、const/aliasing contract を固定する。
- [x] 整数変換、add/sub/compare、倍幅 mul/div を実装する。
- [x] strict decimal parse、exact decimal format、容量検査を実装する。
- [x] 0、最小/最大、負数、fraction、overflow、divide-by-zero、alias、出力不変を検証する。
- [x] host BigInt の有理数 reference で test vector を生成し、固定データとして管理する。
- [x] 両 caller ABI の CP/M で全 API family を実行し、未使用 member の非抽出を確認する。

正本は numeric/fixed の C source と constructors.scc.asm / cpu.scc.asm。
build が C source を ts-internal で compile し、compiler helper を module 専用名へ結び付けた
*.generated.scc.asm と REL を作る。利用時は prebuilt archive を link するだけで C 再compile は不要。
generated assembly は source-runtime の連結にも使い、手編集しない。

archive member は constructors、cpu、common、conversion、arithmetic、comparison、multiply、divide、parse、format。
constructor のみなら他の9 member を抽出しない。add/sub だけなら multiply/divide/parse/format を抽出しない。
common は byte 配列の符号・carry/borrow・shift・commit を扱い、CPU helper は private symbol を使用する。
application の `.eq` / `.asr` 等の実装には依存しない。

mul は最大8-byte の product、div は最大6-byte の拡張 numerator / remainder を使う。
parse は整数部の carry を検出し、fraction は Q8.8 で8桁、Q16.16 で16桁までを使って二進変換する。
各二進閾値はその桁数以内の有限十進数なので、それ以降の桁は丸め結果を変えない。
後続桁も全て検査し、入力 buffer を変更しない。format は末尾の不要な0を付けず、正確な十進数を返す。
最大必要容量は Q8.8 が14 bytes、Q16.16 が24 bytes（NUL 込み）。容量不足では一切書き込まない。

stack 上限（public entry 後からの追加分、外側 caller の引数・return address を除く）:

| API family（両形式共通） | bytes |
| --- | ---: |
| from_int | 0 |
| to_int | 42 |
| add / sub | 56 |
| compare | 30 |
| mul | 66 |
| div | 80 |
| parse | 76 |
| format | 87 |

tools/check-fixed-stack.cjs が生成 Z80 の全分岐と nested call を辿り、上限・SP の復元・再帰なし・可変領域なしを検査する。
割込みからの利用保証は引き続き A2 対象。partial overlap は契約外。

fixedRuntime.test.ts は固定 BigInt vector による240演算、72 parse、46 format/to_int の期待値を両 ABI で照合する。
比較、alias の成功/失敗、NULL、format の境界容量と出力保持、format→parse の raw byte 往復も検証する。
例の [連立方程式](examples/fixed-equations.c) は `2*x+y=6.5, x-y=1` を解き、`2.5` / `1.5` を出力する。
両 ABI × lite/full × prebuilt/source-runtime の8構成で実行する。
実際の CLI からも両 ABI のサンプルを build・実行し、出力と正常終了を検証済み。
CP/M lite の image は両 ABI とも8,962 bytes（このサンプル、現行 build での値）。

```text
pnpm -C packages/c-compiler run build
pnpm -C packages/c-compiler run test:fixed-runtime
```

vector の正本は src/scc/__tests__/data/fixed-vectors.json。
tools/generate-fixed-vectors.cjs --check で BigInt の独立参照計算と照合し、引数なしで再生成する。
実装中に露見した添字内二項演算の precedence と空文字 literal の NUL 出力も修正し、回帰テストを追加した。

Slice 2 完了時（2026-11-17）の検証結果:

| 検査 | 結果 |
| --- | --- |
| c-compiler typecheck / build | pass |
| c-compiler 全回帰 | 19 suites / 1020 tests pass（fixedRuntime 25 tests を含む） |
| CLI typecheck / build / 関連回帰 | pass、3 suites / 11 tests |
| exact BigInt vector / stack CFG 検査 | pass、最大追加 stack 87 bytes、全 return の SP 復元を確認 |
| optional 配布 | none / fixed / bcd / both の source・生成 assembly・archive 除外と prepack が pass、通常配布へ復元済み |
| 連立方程式 | 8構成の CP/M 実行と実際の CLI 両 ABI が pass |
| versions / boundaries / docs / git diff --check | pass |

### Slice 3 — BCD を実用化

- [x] 9-byte format、canonical zero、nibble validation を固定する。
- [x] 整数変換、add/sub/compare、decimal intermediate を使う mul/div を実装する。
- [x] parse/format、桁数超過、carry/borrow、rounding、buffer failure を実装する。
- [x] 全9/全0境界、符号、negative zero、連続 carry、divide-by-zero、alias、出力不変を検証する。
- [x] decimal integer / scale を使う host BigInt reference と照合し、固定 vector を追加する。
- [x] fixed 無しの両 caller ABI CP/M program から全 API family を実行する。

BCD も固定小数点と同じ9 API family（mz80_bcd_from_int / to_int / add / sub / mul / div / compare / parse / format）を提供する。
各 API は mz80_bcd_v1_* export に接続する。to_int は0方向切捨てで signed 16-bit 範囲を検査する。
parse 文法は `[+-]?[0-9]+(\.[0-9]+)?`。小数5桁以上は末尾0でも PRECISION。
診断の優先順位は INVALID > PRECISION > OVERFLOW。format は常に小数4桁、最大19 bytes（NUL 込み）。
失敗時は出力を保持し、out==left/right を許可する。partial overlap と ISR 利用保証は対象外。

内部は little-endian の十進 digit 配列で計算し、公開9-byte packed BCD と相互変換する。
mul は32桁 product、div は scale 調整した20桁 numerator と remainder を使う。
共有 mutable DATA/BSS、heap、fixed module、application の compiler helper に依存しない。
archive は fixed と同じ10 member 構成で、利用した API family の member だけを抽出する。

| BCD API | 最大追加 stack bytes（外側 caller 引数・return address を除く） |
| --- | ---: |
| from_int | 6 |
| to_int | 46 |
| add / sub | 84 |
| compare | 60 |
| mul | 98 |
| div | 110 |
| parse | 48 |
| format | 65 |

check-fixed-stack.cjs bcd が生成 assembly の全分岐・call graph・SP 復元を検査する。
bcdRuntime.test.ts は120演算、30 parse、26 format/to_int の BigInt 固定 vector と alias、NULL、
全 byte 位置の不正 nibble、sign 不正、負のゼロ、容量不足を両 ABI で検証する。

```text
pnpm -C packages/c-compiler run test:bcd-runtime
```

### Slice 4 — 組合せ・platform・配布と完了判定

- [x] none/fixed/bcd/both × lite/full × 両 ABI の選択/拒否/非抽出を検証する。
- [x] raw hook と MSX writable RAM startup で numeric program を実行する。
- [x] full/reduced tarball clean install 先で constructor/演算/format を実行する。
- [x] 外した module の header/include、bridge、symbol、source read が残らないことを確認する。
- [x] core-only image と比較した code/DATA/BSS/最大 stack、tarball size を報告する。
- [x] 選択を外した既存 C Subset / ABI / H1 の回帰、型検査/build、boundary/docs/pack 検査を通す。
- [x] API、仕様、optional build 手順、数値制限、実行証跡を runtime guide / Feature Plan に同期する。

[numeric probe](examples/numeric-probe.c) は選択した module の全 API family を実行する。
numericPlatforms.test.ts は CP/M/raw の32構成と BCD 単独 source-runtime 両 ABI を実行し、
numeric archive に DATA/BSS がないことも REL section から検査する。

MSX は test:msx-numeric が C-BIOS_MSX1 / openMSX の32構成（4選択 × lite/full × 両 ABI × halt/return）を実行する。
32 KiB ROM の page 2 を BIOS ENASLT で設定し、ROM 上の初期 DATA を C000H へ copy、
writable BSS を C200H 以降に配置する。数値出力だけでなく、return が caller に戻ることを RAM marker で確認する。
この検証で CRT START の call exit を jp exit に修正し、return 後の getchar への fallthrough を除去した。
従来の runtime/heap openMSX 8構成も回帰済み。startup は probe 所有で、汎用 DATA-copy CRT の追加を意味しない。
MSX の検証範囲は C-BIOS_MSX1 / primary cartridge slot。expanded-slot cartridge startup は対象外。

test:numeric-builds は core/assembler tarball と各 numeric tarball を別々の consumer directory へ install する。
全 API family を全選択部分集合 × lite/full × 両 ABI で実行し、未同梱 feature の header・source loader・artifact 要求も拒否する。
未選択 module の source directory を含まない複製で runtime artifact 全体を再buildし、prepack が module を復活させないことも確認する。
本検査は managed dist を変更し最後に通常配布へ戻すため、他の build/test と直列に実行する。

2026-11-18 の測定 snapshot（CP/M lite、probe caller を含む image。tarball は当該検証時の docs を含み、文書更新で変動する）:

| 選択 | image bytes | core-only 比 | numeric DATA/BSS | tarball bytes |
| --- | ---: | ---: | --- | ---: |
| none | 120 | 0 | 0 / 0 | 205,060 |
| fixed | 9,468 | +9,348 | 0 / 0 | 252,401 |
| bcd | 9,134 | +9,014 | 0 / 0 | 249,652 |
| fixed,bcd | 18,482 | +18,362 | 0 / 0 | 294,456 |

利用 module の選択に関わらず、core-only caller の image は同一の120 bytes。
上表は最大 code size ではなく probe の抽出結果。全 API 呼出しの stack 上限は fixed 87 / BCD 110 bytes。

```text
pnpm -C packages/c-compiler run test:numeric-builds
pnpm -C packages/c-compiler run test:msx-numeric
pnpm run check:pack
```

Slice 3/4 完了時（2026-11-18）の最終検証結果:

| 検査 | 結果 |
| --- | --- |
| root build（core / assembler / c-compiler / CLI / LSP / VS Code） | pass |
| c-compiler typecheck / 全回帰 | pass、21 suites / 1062 tests（BCD 7、platform 35 tests を含む） |
| CLI typecheck / build / 全回帰 | pass、3 suites / 11 tests |
| fixed / BCD BigInt vector / stack CFG | pass、DATA/BSS なし、SP 復元、最大追加 stack 87 / 110 bytes |
| openMSX numeric | 32構成 pass、DATA copy / 出力 / halt・return marker を確認 |
| openMSX 既存 runtime / heap | 8構成 pass |
| test:numeric-builds | 4構成の source 欠落 build、prepack、clean-install 全 API 実行 pass、通常配布へ復元済み |
| check:pack | public 4 package の metadata / asset / 型 / 全数値 API / heap / CLI / project / DAP clean-install が pass |
| versions / boundaries / docs / git diff --check | pass |

## 完了率と未決定事項

N1 の初期母数は上記4 slice。現在 4/4（100%）。slice ごとの等分であり、工数比ではない。
fixed / BCD 各機能の実装状況も別々に記録し、片方だけの成功で N1 を100%としない。
数値 object layout と constructor の version/contract は Slice 1 で固定した。
fixed の全 API は Slice 2、BCD の全 API は Slice 3 で完了した。

採用した基盤は、module 名 fixed/bcd、既定 features=[]、独立 archive、
Q8.8/Q16.16、16桁/小数4桁 BCD、0方向丸め、status+出力不変である。
BCD の可変 scale/指数は別 version として検討する。

# SCC TS Migration

`@mz80/cli` では、legacy `dcpp` / `sccz80` をそのまま使う経路と、将来の TypeScript compiler 置換経路を切り分けるために adapter と fixture を先に固定しています。

## Compiler Adapter

- `src/scc/compilerAdapter.ts`
  - `CompilerAdapter`
  - `ExternalSccCompilerAdapter`
- `src/scc/tsCompilerAdapter.ts`
  - `TsSccCompilerAdapter`
  - まだ skeleton のみで、fixture を手がかりに未実装範囲を示す
- 現行 driver / project / library build は `CompilerAdapter.compileToRel()` だけに依存します
- 将来の TS compiler は `TsSccCompilerAdapter` の形でここへ差し込む前提です

現在の `compileToRel()` が保証する出力:

- `.i`
- `.scc.asm`
- translated `.asm`
- `.rel`

## Fixture Catalog

fixture の入口は `src/scc/fixtures.ts` です。

- `hello-scc`
  - board 向けの代表的な program 出力
  - helper call, string data, comparison, I/O call を含む
- `hello-mz80`
  - translator 後の比較用出力
- `0crt-scc`
  - board runtime
  - helper 実装の実体を多く含む
- `cpm-runtime-scc`
  - CP/M 向け最小 runtime
- `cpm-hello-scc`
  - CP/M 向け最小 program
- `frag-string-scc`
  - 文字列リテラル配置とアドレスロードだけに絞った fragment
- `frag-helper-call-scc`
  - `.gint` 系 helper call だけに絞った fragment
- `frag-call-scc`
  - `outstr` のような通常 extern call だけに絞った fragment
- `stmt-outstr-scc`
  - 文字列アドレスを積み、`outstr` を call する最小 statement fixture
- `stmt-call-result-scc`
  - 内部関数 call の戻り値を push し、`outchar` へ渡す statement fixture
- `stmt-branch-scc`
  - 内部関数 call の結果を真偽判定して分岐する statement fixture
- `stmt-local-slot-scc`
  - `sp` 相対の local slot へ store/load する statement fixture
- `stmt-compare-helper-scc`
  - `.gt` helper を使って定数比較し、分岐する statement fixture
- `stmt-local-compare-scc`
  - stack-relative local slot を `.gt` helper で比較して分岐する statement fixture
- `stmt-local-int-scc`
  - 2 byte の stack-relative local int slot を store/load する statement fixture
- `stmt-eq-helper-scc`
  - `.eq` helper を使って等値比較し、分岐する statement fixture
- `stmt-loop-scc`
  - stack-relative local slot と helper compare を使って loop/back-edge を作る statement fixture
- `stmt-arg-char-scc`
  - stack-relative function argument を読み出して返す statement fixture
- `stmt-arg-ne-helper-scc`
  - stack-relative function argument を `.ne` helper で比較して分岐する statement fixture
- `stmt-arg-int-scc`
  - stack-relative 2 byte argument を読み出して返す statement fixture
- `stmt-two-arg-char-scc`
  - 2 引数 call のうち、古い側の byte argument を大きい stack offset で読み出す statement fixture
- `stmt-arg-int-eq-helper-scc`
  - stack-relative 2 byte argument を `.eq` helper で比較して分岐する statement fixture
- `stmt-two-arg-ne-helper-scc`
  - 2 引数を異なる stack offset から読み出し、`.ne` helper で比較して分岐する statement fixture
- `stmt-call-two-arg-mixed-scc`
  - caller 側で local byte と定数を評価して 2 引数 push し、callee が古い側を返す statement fixture
- `stmt-two-arg-local-ne-helper-scc`
  - caller 側で local byte と定数を 2 引数として積み、callee が `.ne` helper で比較して分岐する statement fixture
- `stmt-local-int-arg-int-eq-helper-scc`
  - callee-local の 16-bit slot と 16-bit 引数を `.eq` helper で比較して分岐する statement fixture
- `stmt-local-int-arg-int-ne-helper-scc`
  - callee-local の 16-bit slot と 16-bit 引数を `.ne` helper で比較して分岐する statement fixture
- `stmt-local-int-arg-int-gt-helper-scc`
  - callee-local の 16-bit slot とより小さい 16-bit 引数を `.gt` helper で比較して分岐する statement fixture
- `stmt-call-two-arg-int-mixed-scc`
  - caller 側で local 16-bit 値と定数を評価して 2 引数 push し、callee が古い側の 16-bit 引数を返す statement fixture
- `stmt-extern-two-arg-int-call-scc`
  - caller 側で local 16-bit 値と定数を評価して 2 引数 push し、external routine を call する statement fixture
- `hello.rel`, `hello.lst`, `hello.sym`
  - translator / assembler / linker の比較用 artifact

この catalog は「TS compiler が将来どの形の SCC 出力を再現する必要があるか」を明示するためのものです。fixture を増やすときは、カテゴリと feature tag を先に追加してください。

## Helper Inventory

現時点で runtime / program fixture から観測できる Small-C helper 群は大きく 4 系統です。

- memory/value access
  - `.gchar`, `.gint`, `.pchar`, `.pint`
- boolean / compare
  - `.bool`, `.eq`, `.ne`, `.gt`, `.le`, `.ge`, `.lt`, `.uge`, `.ult`, `.ugt`, `.ule`
- arithmetic / bitwise
  - `.or`, `.and`, `.xor`, `.asr`, `.asl`, `.sub`, `.neg`, `.com`, `.mul`, `.div`
- runtime support
  - `.case`, `.sxt`, `brkend`, `etext`, `edata`

最初の TS 移植対象としては、`hello-scc` と `cpm-hello-scc` に出てくる helper 呼び出しを優先するのが妥当です。`0crt-scc` にしか出ない helper は runtime 実装として後段へ回せます。

## Replacement Points

TS compiler 差し替え時の責務境界は以下です。

1. preprocessor
- いまは `dcpp`
- 将来も外部呼び出しのまま残してよい

2. compiler frontend / codegen
- いまは `sccz80`
- 置換対象の本体
- 最初は `CompilerAdapter` を実装して `.scc.asm` または直接 translated `.asm` を返せればよい

3. translator
- いまは `translateSccAsm()`
- TS compiler が直接 `mz80` 記法を吐くなら不要化できる
- ただし dotted symbol / section mapping の互換確認用に当面は残す価値がある

4. assembler / linker
- `mz80 as`, `mz80 link`
- ここは既存実装を維持する前提

## Migration Order

1. fixture を statement / expression / data-init ごとに増やす
2. helper 呼び出しを最小集合へ絞る
3. `TsSccCompilerAdapter` の skeleton を追加する
4. まず `hello-scc` 相当を通す
5. 次に CP/M fixture を通す
6. 最後に board runtime と library を広げる

## Current Status

- `ExternalSccCompilerAdapter`
  - 実運用中
  - `dcpp -> sccz80 -> translate -> as` を包む
- `TsSccCompilerAdapter`
  - fixture 駆動の最小実装あり
  - `fixtureId` を受けて、指定 fixture から `.scc.asm -> .asm -> .rel` を materialize できる
  - `frag-string-scc`, `frag-call-scc`, `frag-helper-call-scc` は TS 側の builtin fragment emitter で生成する
  - parser / semantic analysis / codegen は未実装

## First TS Slice

最初の実装単位は、program 全体ではなく fragment 3 本で切るのが良いです。

1. `frag-string-scc`
- `ld hl,#.0+0`
- `.area _DATA`
- `.asciz`

2. `frag-call-scc`
- extern symbol の単純 `call`

3. `frag-helper-call-scc`
- dotted helper symbol の単純 `call`

この 3 本を通せれば、

- label 発行
- data section 生成
- extern / helper symbol 解決
- basic call emission

までを TS compiler 側で独立に検証できます。その後に `hello-scc` や `cpm-hello-scc` へ広げるのが安全です。

現時点では `frag-string-scc`, `frag-call-scc`, `frag-helper-call-scc` を TS 側 builtin fragment emitter で `.rel` 化できます。`frag-call-scc` は bundled CP/M runtime と link できるところまで確認済みです。次の実装対象は fragment ではなく、簡単な statement / expression の直接 codegen に進む段階です。

最初の statement slice として `stmt-outstr-scc` も追加済みです。これは文字列アドレスの push、call、stack cleanup を含み、bundled CP/M runtime と link して `TS STMT` を出力できます。

次の slice として `stmt-call-result-scc` も追加済みです。これは内部関数 call、定数ロード、戻り値の push、外部 call を含み、bundled CP/M runtime と link して `X` を出力できます。

さらに `stmt-branch-scc` も追加済みです。これは内部関数 call、`HL` の truth-test、numeric local label への branch、外部 call を含み、bundled CP/M runtime と link して `T` を出力できます。

`stmt-local-slot-scc` も追加済みです。これは `dec sp` で 1 byte の local slot を確保し、`ld hl,#0 / add hl,sp` を使った stack-relative な store/load を含み、bundled CP/M runtime と link して `L` を出力できます。

`stmt-compare-helper-scc` も追加済みです。これは `push/pop de` を使った Small-C 風の 2 項比較 helper call を含み、最小 `.gt` helper module と link して `Y` を出力できます。

`stmt-local-compare-scc` も追加済みです。これは stack-relative local slot の load、`.gt` helper call、branch を組み合わせ、最小 helper module と link して `W` を出力できます。

`stmt-local-int-scc` も追加済みです。これは 2 byte の stack-relative local int slot を対象に、low/high byte の store と `A/H/L` を使った再構成 load を含み、bundled CP/M runtime と link して `Z` を出力できます。

`stmt-eq-helper-scc` も追加済みです。これは `.eq` helper による等値比較と branch を含み、比較 helper module と link して `E` を出力できます。

`stmt-loop-scc` も追加済みです。これは stack-relative local slot の更新、`.gt` helper compare、numeric local label への back-edge branch を含み、helper module と link して `321` を出力できます。

`stmt-arg-char-scc` も追加済みです。これは `SP+2` から 1 byte 引数を読み出して返し、bundled CP/M runtime と link して `A` を出力できます。

`stmt-arg-ne-helper-scc` も追加済みです。これは `SP+2` から引数を読み出し、`.ne` helper で比較して branch し、helper module と link して `N` を出力できます。

`stmt-arg-int-scc` も追加済みです。これは `SP+2` から 2 byte 引数を low/high byte で再構成して返し、bundled CP/M runtime と link して `Z` を出力できます。

`stmt-two-arg-char-scc` も追加済みです。これは 2 引数 call の stack layout を使い、`SP+4` から先頭引数を読み出して返し、bundled CP/M runtime と link して `A` を出力できます。

`stmt-arg-int-eq-helper-scc` も追加済みです。これは `SP+2` から 2 byte 引数を読み出し、`.eq` helper で比較して branch し、helper module と link して `I` を出力できます。

`stmt-two-arg-ne-helper-scc` も追加済みです。これは `SP+4` と `SP+2` から 2 つの byte 引数を読み出し、`.ne` helper で比較して branch し、helper module と link して `D` を出力できます。

`stmt-call-two-arg-mixed-scc` も追加済みです。これは caller 側で stack-relative local byte と定数を評価して 2 引数として push し、callee が `SP+4` の古い引数を返し、bundled CP/M runtime と link して `C` を出力できます。

`stmt-two-arg-local-ne-helper-scc` も追加済みです。これは caller 側で local byte と定数を push し、callee が `SP+4` と `SP+2` から読み出して `.ne` helper で比較し、helper module と link して `M` を出力できます。

`stmt-local-int-arg-int-eq-helper-scc` も追加済みです。これは callee 内で 2 byte の local slot を確保して値を書き込み、`SP+4` の 16-bit 引数と `.eq` helper で比較し、helper module と link して `Q` を出力できます。

`stmt-local-int-arg-int-ne-helper-scc` も追加済みです。これは callee 内で 2 byte の local slot を確保して値を書き込み、`SP+4` の 16-bit 引数と `.ne` helper で比較し、helper module と link して `R` を出力できます。

`stmt-local-int-arg-int-gt-helper-scc` も追加済みです。これは callee 内で 2 byte の local slot により大きい値を書き込み、`SP+6` の 16-bit 引数と `.gt` helper で比較し、helper module と link して `T` を出力できます。

`stmt-call-two-arg-int-mixed-scc` も追加済みです。これは caller 側で stack-relative local 16-bit 値と定数を評価して 2 引数として push し、callee が `SP+4` の古い 16-bit 引数を返し、bundled CP/M runtime と link して `S` を出力できます。

`stmt-extern-two-arg-int-call-scc` も追加済みです。これは caller 側で stack-relative local 16-bit 値と定数を評価して 2 引数として push し、external `pickfirst16` routine を call して、bundled CP/M runtime と link して `U` を出力できます。

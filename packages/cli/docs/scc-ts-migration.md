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

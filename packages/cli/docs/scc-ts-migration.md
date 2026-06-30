# SCC TS Migration

`@mz80/cli` では、legacy `dcpp` / `sccz80` をそのまま使う経路と、将来の TypeScript compiler 置換経路を切り分けるために adapter と fixture を先に固定しています。

## Compiler Adapter

- `src/scc/compilerAdapter.ts`
  - `CompilerAdapter`
  - `ExternalSccCompilerAdapter`
- `src/scc/tsCompilerAdapter.ts`
  - `TsSccCompilerAdapter`
  - fixture 駆動の builtin emitter / lowering 実装を持つ
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
  - fixture 駆動の実装あり
  - `fixtureId` を受けて、指定 fixture から `.scc.asm -> .asm -> .rel` を materialize できる
  - fragment / statement fixture は high-level IR から builtin lowering で生成する
  - `ExprIR`, `StmtIRHigh`, `lowerFunctionIR()` を通して stack-relative local/arg, helper compare, call-with-args, loop/back-edge を扱える
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

## Phase Checklist

- [x] Phase 1: fragment 3 本を builtin emitter で `.rel` 化する
- [x] Phase 2: call / push / branch / local slot を含む最初の statement fixture を materialize する
- [x] Phase 3: helper compare と stack-relative local/int access を追加する
- [x] Phase 4: stack-relative argument / 2 引数 call / mixed caller expression を追加する
- [x] Phase 5: callee-local 16-bit slot と 16-bit argument compare を追加する
- [x] Phase 6: high-level IR (`ExprIR`, `StmtIRHigh`, `FunctionIR`) と lowering を導入する
- [x] Phase 7: fragment / statement fixture を high-level IR lowering 経由へ統一する
- [ ] Phase 8: fixture ではなく source parsing / semantic analysis から `ExprIR` / `StmtIRHigh` を構築する
- [ ] Phase 9: fixture 依存を減らし、実ソースの `.scc.asm` 生成へ進む

Phase 8 は着手済みです。現時点では full parser ではなく、`int main(){ return 42; }`、`int value(){ return 88; } int main(){ return value(); }`、`char echo(char a){ return a; }`、`int eqpair(int a, int b){ return a == b; }`、`int flag(int a, int b){ if (a == b) return 1; return 0; }`、`int flag(int a, int b){ if (a > b) return 1; else if (a == b) return 2; else return 3; }`、`int flag(int a, int b){ if (a > b) { return 1; } else { return 0; } }`、`int flag(int a, int b){ int x; if (a > b) { x = 1; return x; } else { x = 0; return x; } }`、`int flag(int a, int b){ if (a > b) { int x = 1; return x; } else if (a == b) { int y = 2; return y; } else { int z = 3; return z; } }`、`int main(){ int x = 65; while (x > 90) { x = 66; } return x; }`、`int main(){ int x = 65; while (x > 90) { int y = 66; x = y; } return x; }`、`int main(){ int x = 65; while (x > 90) x = 66; return x; }`、`int localv(){ int x = 90; return x; }`、`char localc(){ char x = 67; return x; }`、`int localv(int a){ int x; x = a; return x; }`、`int main(){ return pair(65, 66); }` のような subset を `TsSccCompilerAdapter` が直接読めます。

## Lowering Coverage

現時点の high-level lowering が扱える主要パターン:

- data address return
  - `frag-string-scc`
- plain call / call with args / returnExpr
  - `frag-call-scc`, `frag-helper-call-scc`, `stmt-call-result-scc`
- call result -> mode-A runtime call
  - `stmt-outstr-scc`, `stmt-arg-char-scc`, `stmt-arg-int-scc`
- truth-test branch with shared epilogue
  - `stmt-branch-scc`, `stmt-eq-helper-scc`, `stmt-arg-ne-helper-scc`
- stack-relative local / arg byte and 16-bit access
  - `stmt-local-slot-scc`, `stmt-local-int-scc`, `stmt-two-arg-char-scc`
- helper compare as expression
  - `stmt-compare-helper-scc`, `stmt-local-compare-scc`, `stmt-two-arg-ne-helper-scc`
- caller-side local evaluation and call-with-args
  - `stmt-call-two-arg-mixed-scc`, `stmt-call-two-arg-int-mixed-scc`, `stmt-extern-two-arg-int-call-scc`
- callee-local 16-bit temporary plus 16-bit compare
  - `stmt-local-int-arg-int-eq-helper-scc`, `stmt-local-int-arg-int-ne-helper-scc`, `stmt-local-int-arg-int-gt-helper-scc`
- loop / back-edge
  - `stmt-loop-scc`

すべての fixture-backed program は `TsSccCompilerAdapter` 内で high-level IR から `.scc.asm` を生成し、test では translated `.asm` と `.rel` まで検証しています。

## Phase C Entry Slice

source-driven compile path の最初の slice はかなり限定しています。

- zero-argument function definition
  - `int name() { ... }`
  - `char name() { ... }`
- typed parameter list
  - `int echo(int a) { ... }`
  - `int pick(int a, int b) { ... }`
- single statement body
  - `return 42;`
  - `return value();`
- internal / external call expression
  - `return value();`
  - `return echo(66);`
  - `return pair(65, 66);`
- parameter reference expression
  - `return a;`
- compare expression
  - `return a == b;`
  - `return a != b;`
  - `return a > b;`
  - `return a < b;`
  - `return a >= b;`
  - `return a <= b;`
- simple conditional return body
  - `if (a == b) return 1; return 0;`
  - `if (a > b) return 1; else return 0;`
  - `if (a > b) { return 1; } else { return 0; }`
  - `if (a == b) { return 1; } return 0;`
- simple local declaration / assignment
  - `int x = 90; return x;`
  - `int x; x = 91; return x;`
  - `int x; x = a; return x;`
  - `int x; x = value(); return x;`
- branch block with multiple simple statements
  - `int x; if (a > b) { x = 1; return x; } else { x = 0; return x; }`
- brace-wrapped while body
  - `int x = 65; while (x > 90) { x = 66; } return x;`
- single-statement while body
  - `int x = 65; while (x > 90) x = 66; return x;`
- nested single-statement if/else inside a block
  - `if (a > b) { if (b > c) return 1; else return 2; } return 0;`
- chained `else if`
  - `if (a > b) return 1; else if (a == b) return 2; else return 3;`
- `char` parameter / local handling
  - `char echo(char a) { return a; }`
  - `char localc() { char x = 67; return x; }`
- local declarations inside branch / while blocks
  - `if (a > b) { int x = 1; return x; } else { int y = 2; return y; }`
  - `while (x > 90) { int y = 66; x = y; }`
- brace-wrapped `else if` bodies with local declarations
  - `if (a > b) { int x = 1; return x; } else if (a == b) { int y = 2; return y; } else { int z = 3; return z; }`
- duplicate-name rejection
  - duplicate function names are rejected
  - duplicate parameter names are rejected
  - duplicate local names are rejected
  - locals shadowing parameters are rejected

未対応:
- full C statement coverage (`while` beyond the current subset, `for`, `break`, `continue`, expression statements)

この slice の目的は、fixture なしで `source -> parseSubsetProgram() -> ExprIR/StmtIRHigh -> lowering -> .scc.asm` の配線を先に確立することです。

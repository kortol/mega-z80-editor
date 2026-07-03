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
- `frag-helper-call-scc`
  - `.gint` 系 helper call だけに絞った fragment
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

最初の TS 移植対象としては、`hello-scc` と CP/M hello source slice に出てくる helper / call pattern を優先するのが妥当です。`0crt-scc` にしか出ない helper は runtime 実装として後段へ回せます。

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
  - source-driven frontend path は parser / semantic / lowering module に分離済み
  - fixture materialization は adapter 側に残しているが、`--compiler ts` の source compile は `parse -> analyze -> lower -> emit` を通る

## First TS Slice

最初の実装単位は、program 全体ではなく fragment 3 本で切るのが良いです。

1. source slice
- `return "HELLO";`
- `outstr("TS STMT$");`
- `fputc(35, 1); outstr(" HELLO, CP/M$");`

2. `frag-helper-call-scc`
- dotted helper symbol の単純 `call`

この slice を通せれば、

- label 発行
- data section 生成
- extern / helper symbol 解決
- basic call emission

までを TS compiler 側で独立に検証できます。その後に `hello-scc` や CP/M hello source slice へ広げるのが安全です。

## Phase Checklist

- [x] Phase 1: fragment 3 本を builtin emitter で `.rel` 化する
- [x] Phase 2: call / push / branch / local slot を含む最初の statement fixture を materialize する
- [x] Phase 3: helper compare と stack-relative local/int access を追加する
- [x] Phase 4: stack-relative argument / 2 引数 call / mixed caller expression を追加する
- [x] Phase 5: callee-local 16-bit slot と 16-bit argument compare を追加する
- [x] Phase 6: high-level IR (`ExprIR`, `StmtIRHigh`, `FunctionIR`) と lowering を導入する
- [x] Phase 7: fragment / statement fixture を high-level IR lowering 経由へ統一する
- [x] Phase 8: fixture ではなく source parsing / semantic analysis から `ExprIR` / `StmtIRHigh` を構築する
- [x] Phase 9: fixture 依存を減らし、実ソースの `.scc.asm` 生成へ進む

Phase 8 は完了です。full parser ではなく限定 subset ですが、`int main(){ return 42; }`、`int value(){ return 88; } int main(){ return value(); }`、`char echo(char a){ return a; }`、`int eqpair(int a, int b){ return a == b; }`、`int noteq(int a, int b){ return a != b; }`、`int smaller(int a, int b){ return a < b; }`、`int atleast(int a, int b){ return a >= b; }`、`int atmost(int a, int b){ return a <= b; }`、`int flag(int a, int b){ if (a == b) return 1; return 0; }`、`int flag(int a, int b){ if (a > b) return 1; else if (a == b) return 2; else return 3; }`、`int flag(int a, int b){ if (a > b) { return 1; } else { return 0; } }`、`int flag(int a, int b){ int x; if (a > b) { x = 1; return x; } else { x = 0; return x; } }`、`int flag(int a, int b){ if (a > b) { int x = 1; return x; } else if (a == b) { int y = 2; return y; } else { int z = 3; return z; } }`、`int main(){ int x = 65; while (x > 90) { x = 66; } return x; }`、`int main(){ int x = 65; while (x > 90) { int y = 66; x = y; } return x; }`、`int main(){ int x = 65; while (x > 90) x = 66; return x; }`、`int localv(){ int x = 90; return x; }`、`char localc(){ char x = 67; return x; }`、`int localv(int a){ int x; x = a; return x; }`、`int main(){ return pair(65, 66); }` のような subset を `TsSccCompilerAdapter` が直接読み、test では `source -> ExprIR/StmtIRHigh -> lowering -> .scc.asm -> .asm -> .rel` と CLI/CP-M 実行経路まで検証しています。

CLI からも試験的に TS compiler backend を選べます。

- `node dist/index.js cc hello.c hello.com --compiler ts --runtime cpmcrt --com --sym`
- `node dist/index.js dbg hello.com --cpm --sym hello.sym`

現時点の CLI 導線は `TsSccCompilerAdapter` の source subset 制約をそのまま引き継ぎます。full Small-C 互換ではなく、Phase C subset を CLI から直接試せる状態です。

## Phase 9 Status

Phase 9 は完了です。source-driven path に以下を追加しました。

- expression statement
  - `outstr(" HELLO, CP/M$");`
  - `fputc(35, 1);`
- string literal data emission
  - string literal を `.area _DATA` の `.ascii` へ materialize
  - call argument として `ld hl,#.strN+0` を生成

この追加により、従来 fixture で比較していた CP/M hello 相当に加えて、主要な statement pattern も source から直接 `.scc.asm` 生成と CP/M 実行まで検証できます。`stmt-*` fixture は削除し、残る fixture-backed path は `frag-helper-call-scc` の helper call fragment に絞りました。

## Lowering Coverage

現時点の high-level lowering が扱える主要パターン:

- data address return
  - source string literal return
- plain call / call with args / returnExpr
  - source direct extern call, source internal call result
- call result -> mode-A runtime call
  - source `outstr("...")`, source `outchar(...)`
- truth-test branch with shared epilogue
  - source internal call branch, source `==` / `!=`
- stack-relative local / arg byte and 16-bit access
  - source local char/int, source char/int args, source 2-arg call
- helper compare as expression
  - source const/local/arg compare
- caller-side local evaluation and call-with-args
  - source mixed local + const call, source extern 2-arg call
- callee-local 16-bit temporary plus 16-bit compare
  - source local-int vs arg-int `==` / `!=` / `>`
- loop / back-edge
  - source `while (x > 48) { outchar(x); x = x - 1; }`

source-driven program は `TsSccCompilerAdapter` 内で `parse -> analyze -> lower -> emit` を通して `.scc.asm` を生成し、test では translated `.asm` / `.rel` / CP/M 実行まで検証しています。

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

この slice の目的は、fixture なしで `source -> parseProgram() -> analyzeProgram() -> lowerSourceProgram() -> .scc.asm` の配線を先に確立することです。

## Phase 8 Management

- [x] `8.1` Frontend 境界設計
  - [x] `tsCompilerAdapter.ts` 内の責務を `parse / semantic / lowering / diagnostics / orchestration` に分類する
  - [x] 新しい module 構成案を決める
  - [x] Phase 8 の完了条件を「full parser 実装」ではなく「full parser を載せられる構造化」と定義する

- [x] `8.2` AST 型独立
  - [x] `SourceProgram / SourceFunction / SourceStmt / SourceExpr` を adapter 本体から分離する
  - [x] declaration / statement / expression / type node を分ける
  - [x] subset 専用の型名や責務を減らし、拡張前提の AST に寄せる

- [x] `8.3` Parser API 抽出
  - [x] `parseSubsetProgram()` 群を parser module へ移す
  - [x] public 入口を `parseProgram(sourceText)` に揃える
  - [x] parser helper を adapter 本体から外す
  - [x] 現段階では subset 実装のままでよいので、呼び出し境界だけ固める

- [x] `8.4` Diagnostics 基盤
  - [x] parser error を `throw` 直書きから diagnostics 生成へ寄せる
  - [x] diagnostic の最小形式を決める
  - [x] `message`
  - [x] `file`
  - [x] `offset` または `line/column`
  - [x] CLI で見やすい整形方針を決める

- [x] `8.5` Symbol / Scope 基盤
  - [x] duplicate function / parameter / local 検査を semantic pass に移す
  - [x] function scope と block scope をモデル化する
  - [x] symbol table の最小実装を入れる
  - [x] shadowing policy を明文化する

- [x] `8.6` Type モデル基盤
  - [x] `char` / `int` を AST type node と semantic type に分ける
  - [x] width 解決を semantic 側に寄せる
  - [x] 将来の pointer / array を置ける型表現にする

- [x] `8.7` Lowering API 独立
  - [x] `lowerSourceProgram()` 群を lowering module に移す
  - [x] lowering 入力を AST/typed AST に揃える
  - [x] adapter 本体を orchestration のみに寄せる
  - [x] `parse -> analyze -> lower -> emit` の流れを明示する

- [x] `8.8` Expression parser 一般化準備
  - [x] 比較式専用 parser から precedence ベースへ移れる骨組みを作る
  - [x] primary / unary / binary の分離を設計する
  - [x] 演算子優先順位表を定義する
  - [x] まずは `+ -` を足せるところまで整理する

- [x] `8.9` Statement parser 一般化準備
  - [x] `if / while / return / decl / assign` の regex 群を段階的に dispatcher 化する
  - [x] block parser を独立する
  - [x] declaration parser を独立する
  - [x] `for / break / continue / expression statement` の追加位置を明確にする

- [x] `8.10` CLI 統合安定化
  - [x] `--compiler ts` 経路を新 parser/semantic/diagnostics に接続する
  - [x] temp file / stage dir / `.sym/.map/.smap` の扱いを確認する
  - [x] subset 実装から full parser へ移行中でも CLI UX を壊さないようにする

- [x] `8.11` Frontend 回帰テスト新設
  - [x] parser 単体 test を新設する
  - [x] semantic 単体 test を新設する
  - [x] lowering 単体 test を新設する
  - [x] adapter test は e2e 中心へ整理する

- [x] `8.12` Phase 8 完了判定
  - [x] adapter 本体から frontend の主要責務が分離されている
  - [x] subset 実装のままでも full parser を差し込める構造になっている
  - [x] 次段階で `expression statement`, `+ -`, `for` を自然に追加できる
  - [x] docs に新構造と残課題が反映されている

### Frontend Modules

- `src/scc/tsFrontendAst.ts`
  - source AST / type node 定義
- `src/scc/tsFrontendParser.ts`
  - `parseProgram(sourceText)` と statement / expression parser
  - precedence table と branch/block dispatcher を持つ
- `src/scc/tsFrontendDiagnostics.ts`
  - diagnostic 形式、`TsFrontendError`、`file:line:column` 整形
- `src/scc/tsFrontendSemantic.ts`
  - function / block scope、symbol table、duplicate / shadowing / arity 検査
  - AST type node から semantic type へ width を解決する
- `src/scc/tsFrontendLowering.ts`
  - typed AST から `ExprIR` / `StmtIRHigh` / `ProgramSpec` へ lowering
  - compare helper extern 解決をここで行う
- `src/scc/tsProgram.ts`
  - `ProgramSpec` / `ExprIR` / `StmtIRHigh` / builtin emitter
  - fixture path と source path の共通 backend

### Milestones

- [x] `M1` 構造分離完了
  - 対象: `8.1` `8.2` `8.3` `8.7`

- [x] `M2` semantic / diagnostics 基盤完了
  - 対象: `8.4` `8.5` `8.6`

- [x] `M3` full parser 準備完了
  - 対象: `8.8` `8.9` `8.10` `8.11` `8.12`

### Priority

1. `8.1`
2. `8.2`
3. `8.3`
4. `8.7`
5. `8.4`
6. `8.5`
7. `8.11`
8. `8.6`
9. `8.8`
10. `8.9`
11. `8.10`
12. `8.12`

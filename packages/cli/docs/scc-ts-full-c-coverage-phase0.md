# TsSccCompiler Full C Coverage Phase 0

2026-07-23 時点の `TsSccCompiler` source path に対する現状調査メモ。

## Goal

この調査の目的は、`TsSccCompiler` を fixture 依存の比較用実装から、実ソースを `parse -> analyze -> lower -> emit` して `.scc.asm` を安定生成できる TypeScript 製 C compiler path へ持っていく際の現在地を明確にすることです。

最終目標は以下です。

- `--compiler ts` を legacy `sccz80` の補助ではなく、実用的な source compiler backend として使えるようにする
- fixture の有無ではなく、実ソースの C 構文と ABI 経路で進捗を評価できる状態にする
- Phase 10 以降の作業を「reject を個別に潰す」形ではなく、「未実装パスを系統的に埋める」形に変える

## Current Position

現時点で `TsSccCompilerAdapter` は以下を持っています。

- source compile path
  - `parseProgram() -> analyzeProgram() -> lowerSourceProgram() -> emit`
- parser / semantic / lowering の分離
  - frontend は module 化済み
- runtime integration
  - translated `.asm` / `.rel` / CP/M 実行まで test で確認する経路を持つ

つまり「TS compiler の骨組み」はできており、現在の主戦場は Full C coverage を source path 上で広げることです。

## Coverage View

実装上の観点では、coverage は次の 4 経路で見るのが妥当です。

1. `Parser`
- 主要な statement / expression 構文はかなり通っている
- 現在の主 blocker ではない

2. `Semantic lvalue path`
- local / param / array / pointer / aggregate member の参照、代入、inc/dec はかなり入っている
- local aggregate 同士の statement copy も入っている

3. `Aggregate value path`
- `struct/union` を式の値として運ぶ経路
- 現在の最大 blocker

4. `IR / ABI path`
- scalar / pointer 前提から aggregate temporary / argument / return を運べる形へ寄せる必要がある
- aggregate value path と強く結合している

## Current Matrix

`S`: supported
`P`: partial
`N`: not supported

| path / operation | scalar value | pointer value | aggregate lvalue | aggregate value |
| --- | --- | --- | --- | --- |
| local declaration | S | S | S | P |
| read as expression | S | S | P | P |
| assign statement | S | S | S | P |
| assign expression result | S | S | N | P |
| address-of | S | S | S | N |
| member / deref member | N/A | S | S | P |
| pre/post inc/dec | S | S | S for scalar fields | N |
| compare | S | S | N | N |
| logical truthiness | S | S | N | N |
| conditional `c ? x : y` | S | S | N | P |
| comma `(x, y)` | S | S | N | P |
| call argument | S | S | N | P |
| return value | S | S | N | P |

補足:

- `aggregate lvalue` は `x`, `*p`, `(c ? p : q)->field` のように storage location を持つ側
- `aggregate value` は `return x`, `f(x)`, `c ? x : y`, `(x, y)` のように一時値として流れる側
- aggregate compare / truthiness は accidental unsupported ではなく intentional reject

## Confirmed Working Paths

source path で compile / lowering 済みの aggregate value 系:

- `call`
- `conditional`
- `comma`
- `assign-expression result`
- `field-read`
- `field-address`
- `return pass-through`

CP/M runtime まで確認済みの代表例:

- `take(x)`
- `take(make())`
- `return make().a`
- `return (x = make()).a + take(x = make())`
- aggregate assign-expression return pass-through

つまり compile path 自体はかなり進んでいます。

## Main Gap

現時点の最大未解決点は、aggregate-returning function で `conditional` / `comma` をそのまま `return` に流す runtime ABI です。

最小切り分け結果:

- `aggregate assign-expression return pass-through`
  - runtime pass
- `aggregate comma return pass-through`
  - compile は通る
  - runtime では戻り値が壊れる
- `aggregate conditional return pass-through`
  - compile は通る
  - runtime では warm boot に落ちる

このため、aggregate value `return value` は compile-only 観点ではかなり前進しているが、runtime 観点ではまだ `P` です。

## Root Blockers

- `tsFrontendSemantic.ts`
  - aggregate value path はかなり入った
  - ただし aggregate value を一般の scalar expression model に統合してはいない
- `tsFrontendLowering.ts`
  - aggregate call / return ABI、temporary path はある
  - ただし hidden return slot に対する `conditional` / `comma` runtime 経路が未確定
- `tsProgram.ts`
  - aggregate value 専用経路が増えており、一般値モデルへの整理は未着手

## Phase 0 Conclusion

Phase 0 の調査結果としては、次の結論になります。

1. `Parser` は主 blocker ではない
2. `pointer shape` や scalar expression 群はかなり前進している
3. 最大の未解決領域は aggregate value path
4. その中でも最優先は hidden return ABI
5. したがって次作業は coverage 拡張より先に、aggregate return runtime 安定化へ寄せるべき

## Recommended Next Tasks

1. hidden return ABI の runtime 修正
- `return c ? x : y;`
- `return (x, y);`
- 最小 CP/M test を green にする

2. aggregate return runtime coverage の昇格
- compile-only ではなく runtime pass として固定する

3. matrix 再評価
- aggregate value `return value` の `P -> S` 判定を見直す

4. aggregate value exit criteria の消化
- `c ? x : y`
- `(x, y)`
- `f(x)`
- `return x;`
- `return c ? x : y;`
- `return (x, y);`

## Related Files

- `packages/cli/docs/scc-ts-migration.md`
- `packages/cli/src/scc/tsFrontendSemantic.ts`
- `packages/cli/src/scc/tsFrontendLowering.ts`
- `packages/cli/src/scc/tsProgram.ts`
- `packages/cli/src/scc/__tests__/tsCompilerAdapter.test.ts`

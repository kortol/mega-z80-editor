# TsSccCompiler Full C Coverage Phase 0B

調査日: 2026-07-23
調査基準 commit: `13d816ba62b4718c69f620f254aba1950f04cd91`

## Goal

Phase 0B の目的は、`TsSccCompiler` の「どこまで source path で実用化されているか」を、実行証跡つきで固定することです。

この文書は Phase 0 の続編であり、次の実装修正に入る前の調査基準を定義します。

- compile-pass と runtime-pass を分離する
- fixture / fallback / legacy 依存を棚卸しする
- 現行 ABI をコードとテストから抽出する
- aggregate return の failure を `IR / assembly / stack / register` 観点で切り分ける

## 1. Repository Baseline

| item | value |
| --- | --- |
| branch | `main` |
| full commit SHA | `13d816ba62b4718c69f620f254aba1950f04cd91` |
| package manager | `pnpm 9.12.0` |
| Node.js | `v20.19.5` |
| OS / environment | Windows / PowerShell / Codex desktop workspace |
| initial `git status --short` | ` M pnpm-workspace.yaml` |

補足:

- 調査開始時点で作業木は clean ではなく、既存変更は `pnpm-workspace.yaml` のみだった。
- この Phase 0B では production code / test code は変更していない。

## 2. Compiler Pipeline Map

### 2.1 CLI to runtime path

| stage | file | function / class | input -> output | representation | error propagation | legacy fallback |
| --- | --- | --- | --- | --- | --- | --- |
| CLI option parse | `packages/cli/src/index.ts` | `program.command("cc")` | argv -> CLI call | Commander options | command action throws | backend selection only |
| CLI adapter select | `packages/cli/src/cli/mz80-cc.ts` | `compileSccProgramFromCli()` | CLI opts -> `compileSccProgram()` | `Mz80CcCliOptions` | direct throw | yes: `opts.compiler !== "ts"` selects `ExternalSccCompilerAdapter`; `ts` path does not auto-fallback |
| compile orchestration | `packages/cli/src/scc/compileProgram.ts` | `compileSccProgram()` | source path -> `.rel` + linked output | `CompileSccProgramOptions` | wraps preprocess / compile / asm / link failures into `Error` | default adapter is legacy only when caller does not inject TS adapter |
| TS compile entry | `packages/cli/src/scc/tsCompilerAdapter.ts` | `TsSccCompilerAdapter.compileToRel()` | `CompilerAdapterCompileOptions` -> `CompileSccSourceResult` | source / fixture branch | direct throw | no automatic handoff to legacy |
| source read | `packages/cli/src/scc/tsCompilerAdapter.ts` | `compileFromSource()` | file path -> source text | UTF-8 string | `fs` read throws | none |
| parse | `packages/cli/src/scc/tsFrontendParser.ts` | `parseProgram()` | source text -> `SourceProgram` | source AST | diagnostics via `throwDiagnostic()` | none |
| semantic | `packages/cli/src/scc/tsFrontendSemantic.ts` | `analyzeProgram()` | `SourceProgram` -> `BoundProgram` | typed / bound AST | diagnostics via `throwDiagnostic()` | none |
| lowering | `packages/cli/src/scc/tsFrontendLowering.ts` | `lowerSourceProgram()` | `BoundProgram` -> `ProgramSpec` | frontend IR bridge | internal lowering errors throw | none |
| emit | `packages/cli/src/scc/tsProgram.ts` | `emitProgram()` | `ProgramSpec` -> `.scc.asm` text | low-level emit spec / stack offsets | unhandled node throws | none |
| translate | `packages/cli/src/scc/tsCompilerAdapter.ts` + `translateAsm.ts` | `translateSccAsm()` | `.scc.asm` -> `.asm` | Small-C asm -> mz80 asm | throw on translate failure | none |
| assemble | `packages/cli/src/cli/mz80-as.ts` via adapter | `assemble()` | `.asm` -> `.rel` | REL v2 object | returns context; caller throws on `ctx.errors.length > 0` | none |
| bundled runtime build | `packages/cli/src/scc/compileProgram.ts` | `buildBundledRuntime()` | runtime name -> runtime `.rel` | runtime `.scc.asm` -> `.asm` -> `.rel` | throw on assembly error | runtime source is bundled fixture-like asset, not legacy compile |
| link | `packages/cli/src/cli/mz80-link.ts` via `compileProgram.ts` | `link()` | object files -> `.com` / linked output | linker inputs / memory layout | caller throws on link failure | none |
| CP/M runtime evidence | `packages/cli/src/scc/__tests__/tsCompilerAdapter.test.ts` | `linkAndRunCom()` | `.rel` -> emulator output | linked COM image | `expect(result.reason).toBe("BDOS 0: terminate")` | none |

### 2.2 Aggregate value path

`parseProgram()` produces `SourceExpr` / `SourceStmt` forms.

`analyzeProgram()` converts aggregate-valued expressions into dedicated bound forms rather than folding them into scalar `BoundExpr`:

- `aggregateRef`
- `aggregateAssignExpr`
- `call`
- `comma`
- `conditional`

`lowerSourceProgram()` keeps that split and emits:

- `AggregateValueIR`
- `ExprIR`
- `StmtIRHigh`

`emitProgram()` lowers those to:

- `AggregateValueSpec`
- `ExprSpec`
- stack-relative offsets and explicit byte-copy assembly

The current design is therefore not “general value model first”; aggregate values travel on a dedicated path all the way to emission.

## 3. Fixture / Fallback Inventory

検索範囲:

- `packages/cli/src/scc/**/*.ts`
- `packages/cli/src/cli/**/*.ts`
- `packages/cli/src/scc/__tests__/**/*.ts`

主な検索語:

- `fixture`
- `fallback`
- `temporary`
- `TODO`
- `FIXME`
- `ExternalSccCompilerAdapter`
- `TsSccCompilerAdapter`
- `sccz80`
- `readSccFixture`
- `makeFixtureProgramSpec`

### 3.1 Confirmed entries

| kind | file / lines | condition | caller | related tests | impact |
| --- | --- | --- | --- | --- | --- |
| explicit fixture branch | `packages/cli/src/scc/tsCompilerAdapter.ts:173-183` | constructor `fixtureId` present | `TsSccCompilerAdapter.compileToRel()` | `tsCompilerAdapter.test.ts` fixture-backed tests near `2417`, `2430` | direct bypass of source parse/analyze/lower path |
| fixture-backed SCC asm emission | `packages/cli/src/scc/tsCompilerAdapter.ts:192-235` | `compileFromFixture()` | same | same | writes fake preprocessed file and fixture-backed `.scc.asm` |
| golden fixture table | `packages/cli/src/scc/fixtures.ts:17-66` | static fixture id lookup | `getSccFixture()` / `readSccFixture()` | translator / linker / adapter fixture tests | source compiler coverage can be overstated if these are counted as source passes |
| hard-coded fixture program spec attempt | `packages/cli/src/scc/tsCompilerAdapter.ts:906-913` | `emitFixtureBackedSccAsm()` calls `makeFixtureProgramSpec()` then returns `readSccFixture()` | fixture path only | fixture-backed tests | indicates transitional code; source path does not use it |
| legacy backend selection | `packages/cli/src/cli/mz80-cc.ts:40-46` | `opts.compiler !== "ts"` | CLI `cc` command | `mz80-cc.test.ts`, external-toolchain tests | explicit backend choice, not silent fallback |
| legacy default in orchestration | `packages/cli/src/scc/compileProgram.ts:67-71` | no injected adapter | `compileSccProgram()` | `compileProgram.test.ts`, `buildLibrary.test.ts` | compile orchestrator is legacy-biased unless caller injects TS adapter |
| legacy preprocess + sccz80 path | `packages/cli/src/scc/compilerAdapter.ts:68-126` | `ExternalSccCompilerAdapter.compileToRel()` | CLI / project / library flows | external adapter tests | still required for non-TS compiler mode |
| fixture-like bundled runtime | `packages/cli/src/scc/compileProgram.ts:128-160` | runtime selected | `compileSccProgram()` | runtime/link integration tests | not a fallback to legacy C compile, but still relies on bundled `.scc.asm` asset |
| test-only helper object code | `packages/cli/src/scc/__tests__/tsCompilerAdapter.test.ts:13-129` | compare helper / external helper assembly | runtime tests only | many CP/M runtime tests | runtime success for compare/extern cases depends on test-specific helper RELs |

### 3.2 Negative findings

| query | result |
| --- | --- |
| source path / basename dispatch in TS compiler | no basename-specific branch found in `compileFromSource()` |
| source text equality match for canned asm | no source-text equality dispatch found |
| unsupported syntax silently delegated to legacy from `TsSccCompilerAdapter` | none found |
| automatic `sccz80` handoff after TS parse/semantic failure | none found |
| `TODO` / `FIXME` markers in `packages/cli/src/scc` for fallback routing | none found by text search |

### 3.3 Conclusion

The remaining fallback risk is not “silent legacy delegation inside TS mode”. The confirmed risks are:

- explicit fixture mode inside `TsSccCompilerAdapter`
- legacy-by-default orchestration outside `--compiler ts`
- test-only helper RELs that can make runtime success broader than compiler self-sufficiency

## 4. Full C Coverage Matrix

Status set:

- `unsupported`
- `parse-only`
- `semantic-only`
- `emit-only`
- `link-pass`
- `runtime-pass`
- `runtime-pass-with-limitations`
- `intentional-reject`
- `unknown`

Count summary for this 59-row matrix:

- `runtime-pass`: 26
- `runtime-pass-with-limitations`: 17
- `unsupported`: 11
- `unknown`: 5

Evidence convention:

- parser / semantic evidence: `packages/cli/src/scc/__tests__/tsFrontendParser.test.ts`, `tsFrontendSemantic.test.ts`
- runtime evidence: `packages/cli/src/scc/__tests__/tsCompilerAdapter.test.ts`
- implementation: `tsFrontendParser.ts`, `tsFrontendSemantic.ts`, `tsFrontendLowering.ts`, `tsProgram.ts`

### 4.1 Types

| item | status | source test / evidence | observed result | known limitation |
| --- | --- | --- | --- | --- |
| void | unknown | `returnVoid` exists in lowering/emitter; no source-path runtime test located | emit path exists | no direct `void` function coverage record |
| char / signed char / unsigned char | runtime-pass-with-limitations | runtime: `source mode char argument reads a stack argument and returns it`; parser/semantic tests cover `char` declarations | `char` runtime pass | `signed/unsigned char` forms not evidenced |
| short / unsigned short | unsupported | no parser/semantic/runtime evidence; type model centers on `char`/`int` | no confirmed path | unsupported until evidenced |
| int / unsigned int | runtime-pass-with-limitations | runtime: `source mode int argument reads a 2-byte stack argument and returns it` | `int` runtime pass | `unsigned int` not evidenced |
| long / unsigned long | unsupported | no evidence | none | unsupported |
| pointer | runtime-pass | runtime: conditional pointer-member, pointer compare, address/deref tests | runtime pass | function-pointer class excluded |
| array / multidimensional array | runtime-pass-with-limitations | runtime: `stmt-array-assign`, `stmt-array-string-init`, `stmt-array-dynamic`, param-array tests | 1-D char-array runtime pass | multidimensional arrays unverified |
| function type / function pointer | unsupported | no parser/runtime evidence | none | unsupported |
| struct | runtime-pass-with-limitations | runtime: aggregate member, argument, return, chained value tests | runtime pass on many source paths, including conditional/comma aggregate return pass-through | union aggregate-return runtime proof remains separate |
| union | runtime-pass-with-limitations | runtime: `stmt-aggregate-assign` includes `union Bar`; semantic supports union tags/fields | union storage/runtime evidence exists | no dedicated union aggregate-return runtime proof |
| enum | unsupported | no evidence | none | unsupported |
| typedef | unsupported | no evidence | none | unsupported |
| qualifier | unsupported | no evidence | none | unsupported |
| incomplete type / forward declaration | runtime-pass-with-limitations | runtime: `stmt-extern-two-arg-int-call` proves external function declaration; no aggregate forward-decl evidence | function forward declaration path works | incomplete aggregate types unverified |

### 4.2 Expressions

| item | status | source test / evidence | observed result | known limitation |
| --- | --- | --- | --- | --- |
| literal / identifier / string | runtime-pass | runtime: local scalar tests, string-init tests | runtime pass | none found for covered subset |
| subscript | runtime-pass-with-limitations | runtime: `stmt-array-dynamic`, `stmt-param-array-read`, `stmt-param-array-write` | runtime pass for char arrays / pointers | non-char multidimensional indexing unverified |
| function call | runtime-pass | runtime: `stmt-call-result`, `stmt-call-two-arg-mixed`, aggregate call tests | runtime pass | indirect call unsupported |
| member / pointer member | runtime-pass | runtime: `stmt-aggregate-member`, `stmt-pointer-member` | runtime pass | aggregate value member path still limited by return ABI edge cases |
| prefix/postfix increment/decrement | runtime-pass | runtime: `stmt-inc-dec`, `stmt-prefix-inc-dec` | runtime pass | covered subset only |
| address / dereference | runtime-pass | runtime: pointer-member address and field-address tests | runtime pass | address-of restricted to locals / array elements / deref path |
| unary operators | runtime-pass-with-limitations | runtime: `stmt-not`, `stmt-bitnot`; parser supports unary minus via other runtime tests | runtime pass for `!`, `~`, unary `-` | casts and richer unary forms absent |
| `sizeof` | runtime-pass-with-limitations | adapter compile tests include mixed `sizeof`; semantic handles sizes | compile/runtime evidence exists in subset | incomplete coverage across all type classes absent |
| cast | unsupported | no evidence | none | unsupported |
| arithmetic | runtime-pass | runtime: `stmt-additive`, helper-op tests | runtime pass | limited to current scalar widths |
| shift | runtime-pass | runtime: helper-op tests covering `<<` / `>>` | runtime pass | helper-backed only |
| relational / equality | runtime-pass | runtime: compare helper tests across local/arg/int/pointer cases | runtime pass | aggregate compare intentionally absent |
| bitwise | runtime-pass | runtime: `stmt-bitwise`, `stmt-bitnot` | runtime pass | scalar subset only |
| logical and/or | runtime-pass | runtime: `stmt-logical` | runtime pass with short-circuit behavior | aggregate truthiness excluded |
| conditional | runtime-pass | runtime: scalar/pointer cases pass; aggregate call/assignment/member cases pass; aggregate return pass-through conditional passes after P0 | runtime pass | union aggregate-return analog still not separately evidenced |
| assignment / compound assignment | runtime-pass-with-limitations | runtime: `stmt-compound-assign`, `stmt-aggregate-assign`, `stmt-aggregate-assign-expr-result` | runtime pass for scalar and many aggregate paths | general aggregate initializer/value model still partial |
| comma | runtime-pass | runtime: aggregate call-value comma path passes; aggregate return pass-through comma passes after P0 | runtime pass | union aggregate-return analog still not separately evidenced |

### 4.3 Statements

| item | status | source test / evidence | observed result | known limitation |
| --- | --- | --- | --- | --- |
| compound / expression | runtime-pass | many runtime tests use block statements and expr statements | runtime pass | none on covered subset |
| if/else | runtime-pass | runtime: `stmt-branch`, branch-local aggregate init tests | runtime pass | none on covered subset |
| switch/case/default | runtime-pass | runtime: `stmt-switch` | runtime pass | integer literal case labels only |
| while / do / for | runtime-pass | runtime: `stmt-loop`, `stmt-do-while`, `stmt-for`, `stmt-for-decl` | runtime pass | control nesting has explicit cap |
| break / continue | runtime-pass | runtime: `stmt-for` | runtime pass | restricted to valid loop/switch contexts |
| goto / label | unsupported | no evidence | none | unsupported |
| return | runtime-pass-with-limitations | scalar return and struct aggregate return pass across direct/call/assign/conditional/comma pass-through paths | runtime pass for current struct evidence | union aggregate-return runtime proof still pending |

### 4.4 Declarations / Initializers

| item | status | source test / evidence | observed result | known limitation |
| --- | --- | --- | --- | --- |
| global / local / parameter | runtime-pass-with-limitations | locals and parameters heavily covered; global data declarations not directly runtime-covered | locals/params runtime pass | global variable support not evidenced |
| prototype / definition | runtime-pass | runtime: `stmt-extern-two-arg-int-call`, ordinary function definitions throughout | runtime pass | none for covered subset |
| extern / static / typedef | runtime-pass-with-limitations | `extern` function declaration evidenced by runtime test | partial | `static` / `typedef` not evidenced |
| scalar initializer | runtime-pass | runtime: local scalar init tests | runtime pass | covered subset only |
| aggregate initializer | unsupported | no evidence for brace aggregate initializers | none | unsupported |
| nested / partial initializer | unsupported | no evidence | none | unsupported |
| zero fill | runtime-pass-with-limitations | migration doc and array string-init runtime imply zero-fill for `char buf[4] = "AB"` | runtime evidence for char arrays | broader object zero-fill not evidenced |
| string initializer | runtime-pass | runtime: `stmt-array-string-init`, `stmt-array-string-init-exact-fit` | runtime pass | char arrays only |
| tentative definition | unknown | no evidence found | unknown | not enough source-path proof |

### 4.5 ABI

| item | status | source test / evidence | observed result | known limitation |
| --- | --- | --- | --- | --- |
| scalar argument | runtime-pass | runtime: `stmt-arg-char`, `stmt-arg-int`, two-arg tests | runtime pass | none on covered subset |
| pointer argument | runtime-pass | runtime: field-address tests pass pointers to helper functions | runtime pass | function pointers excluded |
| aggregate argument | runtime-pass | runtime: `stmt-aggregate-call`, `stmt-aggregate-return-nested` | runtime pass | same hidden-return risks when nested in failing forms |
| scalar return | runtime-pass | many scalar-return runtime tests | runtime pass | none on covered subset |
| pointer return | unknown | pointer use is covered, but dedicated pointer-return runtime test not located | unknown | no direct evidence |
| aggregate return | runtime-pass-with-limitations | runtime: `stmt-aggregate-return`, `stmt-aggregate-return-nested`, `stmt-aggregate-return-pass-through-assign`, `...-conditional`, `...-comma` pass | struct aggregate runtime pass | union aggregate-return runtime proof still pending |
| direct call | runtime-pass | pervasive runtime evidence | runtime pass | none on covered subset |
| indirect call | unsupported | no function-pointer call path | none | unsupported |
| nested call | runtime-pass | runtime: `stmt-aggregate-return-nested`, chained value tests | runtime pass | none on covered subset |
| recursion | unknown | no recursion test found | unknown | no evidence |
| register preservation | unknown | no direct register-contract test found | unknown | assembly inference only |
| stack cleanup | runtime-pass | emitter pushes args then caller pops `bc`; runtime tests with multi-arg/nested calls pass | runtime pass | exact contract only partially documented |

## 5. ABI Specification Extract

Confirmed from code and tests:

| item | extracted behavior | basis |
| --- | --- | --- |
| `char` size | 1 byte | `ValueWidth = 1 | 2`, byte load/store emitters, runtime char arg tests |
| `int` size | 2 bytes | word load/store emitters, `stmt-arg-int` |
| `short` / `long` | not implemented as distinct source-path types | no parser/type evidence |
| pointer size | 2 bytes | pointer locals/args use width 2; stack arg access uses word loads |
| default signedness | not conclusively specified | compare helpers exist, but signedness policy is not explicitly evidenced |
| alignment rule | effectively byte-packed in current aggregate copy helpers | aggregate copy walks byte offsets with no padding logic |
| struct member offset / padding | current lowering copies byte-by-byte using semantic offsets; no padding rule proven beyond tested layouts | field offsets come from semantic type info; no explicit padding test found |
| union size / alignment | size-driven only on lowering/emission path | aggregate IR/spec carries `size`; no union-specific alignment proof |
| array stride | `char` array stride 1; pointer arithmetic uses scale `1` or `2` based on pointee | `pointerAdd.scale` and array runtime tests |
| argument order | hidden aggregate-return pointer occupies arg slot 0; user params shift by `paramSlotBase = 1` for aggregate-returning functions | `tsFrontendLowering.ts:61`, `getParamIrSlot()` |
| stack frame layout | locals reserved first; arguments accessed via positive stack offsets; temp aggregate slots appended after user locals | `lowerFunctionIR()`, `layoutFunction()`, temp slot allocation |
| caller / callee cleanup | caller pushes args and caller pops `bc` per arg after call | `emitCallExpr()` / `emitPushArgs()` |
| scalar return register | `HL` | `returnExpr` loads expr to `HL` then `ret` |
| pointer return | also `HL` if implemented, by same scalar-width-2 path | inferred, not directly runtime-proven |
| aggregate argument passing | caller materializes aggregate to temp/local address and passes pointer | `aggregateAddress` call args |
| hidden aggregate return pointer position | first argument slot (`arg` slot `0`) | `lowerAggregateReturnToReturnSlot()` |
| hidden return pointer lifetime | valid for duration of callee; callee copies bytes into caller-owned destination | aggregate return lowering/emission |
| preserved / clobbered registers | not formally specified | no direct register contract tests |
| temporary aggregate storage | stack local temp slots allocated by `allocateTempLocal()` | lowering code and aggregate value field/call paths |

Open mismatches / unknowns:

- signedness policy is not directly documented by code comments or tests
- explicit struct padding / alignment guarantees are not proven
- preserved/clobbered register contract is inferred, not tested

## 6. Aggregate Return Investigation

### 6.1 Shared lowering facts

For aggregate-returning functions:

- `lowerFunction()` sets `paramSlotBase = 1`
- the hidden destination pointer is treated as argument slot `0`
- `return` lowers through `lowerAggregateReturnToReturnSlot()`
- final control flow is wrapped in `returnVoid`, so the data contract is “callee copies bytes into caller-provided destination, then returns normally”

Shared emitter facts:

- aggregate values are materialized through explicit byte copies
- calls that produce aggregate values push destination address as first call argument
- caller pops every pushed arg after call, including hidden destination address for nested aggregate materialization

### 6.2 Path comparison

| C form | semantic result | lowering path | materialization style | runtime status |
| --- | --- | --- | --- | --- |
| `return x;` | aggregate ref | `aggregateRef -> lowerAggregateCopy(Local|Arg)ToReturnSlot()` | copy bytes directly into hidden destination | pass for struct; union return unverified |
| `return f();` | aggregate call | `call -> evalExpr(call target, first arg = hidden destination)` | destination-passing call, no local copy required | pass for struct; union return unverified |
| `return c ? x : y;` | aggregate conditional | `conditional -> ifExprZero -> branch-local copy to hidden destination` | each branch copies to same hidden destination | runtime pass after P0 |
| `return (x, y);` | aggregate comma | `comma -> eval left expr -> recurse on right aggregate expr` | left side effect first, then copy right result to hidden destination | runtime pass after P0 |

### 6.3 Direct observations

Confirmed facts:

- Struct `return x;` works at runtime through byte-copy to arg slot `0`.
- Struct `return f();` works at runtime through direct destination-passing call.
- Struct `return (z = makeB());` works at runtime; this proves hidden return destination itself is not universally broken.
- Pre-fix, Struct `return c ? x : y;` reached warm boot instead of `BDOS 0: terminate`.
- Pre-fix, Struct `return ((side = 1), y);` returned the wrong byte (`NUL` instead of `A`).
- The same lowering/emission helpers are aggregate-size based and do not branch on `struct` vs `union`; therefore union return likely shares the same risk surface, but dedicated runtime proof is absent.

High-confidence root cause after P0:

- The hidden return destination protocol itself was not the direct failure.
- The direct cause was function-local numeric labels being reused per function in `.scc.asm` and then flattened to global translated asm labels, so multiple functions emitted the same translated labels such as `__scc_local_5`.
- Aggregate return `conditional` / `comma` made this visible because they emit extra intra-function jump targets around branch/copy materialization; some jumps could therefore resolve into another function's local continuation block after translation.
- The P0 fix had two parts:
  - route aggregate-return `conditional` / `comma` through explicit temp-local materialization before the final hidden-return copy
  - scope emitted local labels by function name in `tsProgram.ts`, so translated asm no longer aliases branch targets across functions

Low-confidence hypotheses:

- Union aggregate return may still expose a distinct ABI bug that this struct-only P0 does not cover.

Unverified items:

- whether union conditional/comma aggregate return fails identically at runtime

### 6.4 Assembly / stack perspective

Relevant code points:

- hidden return arg injection: `packages/cli/src/scc/tsFrontendLowering.ts:61, 485-530`
- hidden destination loads from arg slot `0`: `packages/cli/src/scc/tsFrontendLowering.ts:444-468, 511`
- aggregate materialization emitter: `packages/cli/src/scc/tsProgram.ts:1167-1211`
- failing runtime assertions: `packages/cli/src/scc/__tests__/tsCompilerAdapter.test.ts:2865-2882`

The decisive assembly symptom was that translated asm contained duplicate global labels such as `__scc_local_4` / `__scc_local_5` across multiple functions, and branch instructions inside `passthroughComma` / `pick` could resolve to the later duplicate block near another function instead of their own local continuation.

Root cause confidence: medium.

## 7. Test Inventory and Execution Evidence

### 7.1 Test categories found

| category | location | note |
| --- | --- | --- |
| parser unit tests | `packages/cli/src/scc/__tests__/tsFrontendParser.test.ts` | source parser coverage |
| semantic tests | `packages/cli/src/scc/__tests__/tsFrontendSemantic.test.ts` | bound/type and rejection coverage |
| lowering unit tests | not found as a dedicated `tsFrontendLowering.test.ts` | lowering is covered indirectly through adapter/runtime tests |
| assembly snapshot / golden tests | fixture-backed translator / asm tests, fixture files under `src/scc/__tests__` | not pure source-path proof |
| source compile tests | many `TsSccCompilerAdapter.compileToRel()` tests | compile / emit proof without runtime |
| assemble/link tests | `linkAndRunCom()` helpers and translation/link tests | object/link proof |
| CP/M runtime tests | `tsCompilerAdapter.test.ts` runtime block around lines `2494+` | strongest source-path evidence |
| legacy differential tests | external adapter / compare / CLI tests using `ExternalSccCompilerAdapter` | not TS-path proof |
| CLI integration tests | `packages/cli/src/cli/__tests__/mz80-cc.test.ts` | backend selection/orchestration |

### 7.2 Compile-pass but no runtime proof

Examples confirmed in `tsCompilerAdapter.test.ts`:

- aggregate return pass-through compile test for conditional / comma / assign-expression values near `2847`
- many `source mode supports ... in the Phase C subset` tests before runtime section are `compileToRel()`-only checks
- parser / semantic feature acceptance without CP/M execution

### 7.3 Legacy-only / fixture-only / skipped

| item | result |
| --- | --- |
| legacy-only tests | `compileProgram.test.ts`, `buildLibrary.test.ts`, `mz80-cc.test.ts` include `ExternalSccCompilerAdapter` paths |
| fixture-only tests | `TsSccCompilerAdapter({ fixtureId: "frag-helper-call-scc" })` tests near `2417`, `2430`; translator fixture assets in `fixtures.ts` |
| skipped / todo / disabled | none found by search for `skip` / `todo` in `packages/cli/src/scc/__tests__` |
| flaky / environment-dependent | CP/M runtime and some external-toolchain tests are environment-sensitive by nature; this Phase 0B ran the TS frontend trio only |

### 7.4 Executed commands

| command | exit code | pass | fail | skip |
| --- | --- | --- | --- | --- |
| `pnpm test -- tsFrontendParser.test.ts tsFrontendSemantic.test.ts tsCompilerAdapter.test.ts` | `0` | `369` | `0` | `0` |

Passing suites:

- `tsFrontendParser.test.ts`
- `tsFrontendSemantic.test.ts`
- `tsCompilerAdapter.test.ts`

## 8. Documentation Drift

### 8.1 Overstated or mixed-status items

- `packages/cli/docs/scc-ts-migration.md` grouped coverage as `S / P / N`, which hid the distinction between compile-only, link-pass, and runtime-pass.
- The migration doc correctly called out aggregate return ABI instability at the time of investigation.
- P0 now promotes struct aggregate return pass-through for `conditional` / `comma` from runtime-failing to runtime-pass, while leaving union runtime proof explicitly open.

### 8.2 Implemented but under-specified

- CP/M runtime evidence is broader than the old document stated:
  - aggregate call arguments
  - chained aggregate-returning calls
  - pointer-member address paths
  - branch/loop-local aggregate declaration initializers

### 8.3 Reject vs unsupported

- Aggregate compare / truthiness are design-level rejects, not “not yet implemented”.
- Cast / typedef / enum / goto are currently unsupported because no implementation evidence exists.

### 8.4 Legacy / fixture drift

- Success in CLI/library orchestration tests can still come from explicit legacy backend selection.
- Fixture-backed adapter mode still exists inside `TsSccCompilerAdapter`; it must not be counted as source-path coverage.

### 8.5 Phase 10 exit criteria gap

Still open relative to `packages/cli/docs/scc-ts-migration.md`:

- `return c ? x : y;` runtime green
- `return (x, y);` runtime green
- broader type surface (`typedef`, `enum`, casts, multidimensional arrays, function pointers)
- explicit ABI evidence for pointer return / recursion / register preservation

### 8.6 Concrete drift fix in this doc update

The migration document had unrelated text injected into the Phase 8 checklist region. This Phase 0B update removes that corruption because it materially interfered with docs trustworthiness.

## 9. Prioritized Next Work

### P0

| target | dependencies | layer | required tests | recommended PR split |
| --- | --- | --- | --- | --- |
| hidden aggregate return ABI for `conditional` / `comma` pass-through | completed on 2026-07-23 | `tsFrontendLowering.ts`, `tsProgram.ts`, runtime tests | existing failing runtime tests now pass; next step is union analog coverage | PR1 completed |
| union aggregate-return runtime proof | P0 fix above | runtime tests only, maybe no compiler changes if already covered | add union `return x/f()/cond/comma` runtime tests | PR2: union ABI proof |

### P1

| target | dependencies | layer | required tests | recommended PR split |
| --- | --- | --- | --- | --- |
| dedicated lowering tests for aggregate return ABI | P0 facts stabilized | new test layer for `tsFrontendLowering` / `tsProgram` | IR/spec snapshot tests for hidden return pointer and temp slots | PR3: lowering/spec tests |
| explicit matrix promotion of compile-only rows | P0 runtime fixes | docs + tests | rerun frontend/runtime suite and update matrix counts | PR4: docs and evidence refresh |

### P2

| target | dependencies | layer | required tests | recommended PR split |
| --- | --- | --- | --- | --- |
| unsupported surface expansion (`typedef`, `enum`, casts, multidim arrays, function pointers) | P0/P1 complete | parser, semantic, lowering, emitter | parser+semantic+runtime slices per feature family | one PR per feature family |
| formal ABI documentation for registers/alignment | more direct tests or emulator tracing | docs + targeted tests | register preservation / pointer return / recursion tests | separate ABI-proof PR |

## Final Working Tree

調査開始時:

```text
 M pnpm-workspace.yaml
```

Phase 0B 文書更新後の最終状態は、Issue コメントにも転記する。

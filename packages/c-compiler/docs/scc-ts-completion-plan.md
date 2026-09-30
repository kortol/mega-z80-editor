# Fixed 8/16-bit C Subset completion

Date: 2026-09-29

## Agreed completion criterion

Complete the legal remaining features of the fixed char(8)/int(16) Subset.
Do not implement invalid C operations (aggregate comparison/truthiness) merely
to change an inventory N to S. Keep explicit rejection tests. Full ISO C,
floating/long types, VLA, external compiler ABI and system headers remain outside
this target. The previous 58/63 number mixed supported features with intentional
rejections and is not a percentage of this implementation target.

## Work breakdown and acceptance evidence

- [x] S04: function-scoped labels and goto. Parse chained labels and labeled
  statements; resolve forward/backward jumps; diagnose duplicate/undefined labels;
  preserve SP and local storage across loop/block exits. Unit and CP/M runtime
  tests, including identical label names in separate functions.
- [x] P01: token-aware object/function macro expansion, recursive expansion with
  recursion suppression, balanced arguments, strings/comments, line continuation,
  #undef, #elif and integer #if expressions with short circuit. Preserve injected
  defines and bundled variadic-provider provenance. Include resolution/guards,
  malformed input diagnostics, unit and source-to-CP/M tests. Token paste,
  stringification is implemented. Variadic macros, pragma, line-control and
  system-header discovery remain outside this Subset.
- [x] I03: type-directed recursive brace initialization and member/index
  designators, bounds/member diagnostics, zero fill and continuation after a
  designator; cover local/global/static, structs/unions and fixed-dimensional
  arrays. Preserve evaluation of initializer expressions and nested aggregate
  copies. Unit plus independent CP/M tests.
- [x] I04/X31: compound literals for supported object types, correct automatic
  block lifetime and static file-scope storage; address/member/index consumers,
  by-value call/return and repeated evaluation. Diagnose invalid type/initializer.
- [x] E07: audit legal aggregate lvalue-to-value consumers, expression statements,
  conditional/comma/call/return; maintain semantic rejects for compare/truthiness.
- [x] X31: split compound literals from excluded extensions/types; maintain
  explicit diagnostics for statement expressions, generic selection, typeof and
  floating literals unless separately added to this target.
- [x] Verification: targeted frontend/preprocessor/adapter tests, complete
  c-compiler tests, typecheck/build and diff check. Update inventory with actual
  evidence and exact remaining boundaries. No 100% claim until every accepted
  implementation task above is complete.

## Execution notes

Initial checkout: clean main, HEAD 550c6b3. Existing #undef support is ahead of
the inventory text; verify behavior instead of reimplementing it blindly.
Completed verification: `pnpm test` (all package suites), `pnpm run typecheck`,
`pnpm run build`, and `git diff --check`. Compound literals are runtime-covered
for aggregate by-value calls/returns, conditional consumers, nested member/address
consumers, and repeated evaluation; no implementation-target P item remains.

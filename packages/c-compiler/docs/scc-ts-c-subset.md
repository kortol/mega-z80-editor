# TsSccCompiler C Subset Feature Inventory

更新日: 2026-09-10

## Purpose

この文書は `TsSccCompilerAdapter` の source path が対象とする C Subset を定義し、実装確認の基準を固定する。
ここでいう source path は `C source -> Source AST -> semantic -> lowering -> .scc.asm -> .rel -> linked image` であり、`SCC.exe` または fixture の成功は `S` 判定に含めない。

Full ISO C を分母にした進捗率は扱わない。実装対象はこの inventory の各 feature であり、追加する feature は先にこの文書へ追加する。
binary ABI と stack frame の正本は [scc-ts-binary-abi.md](./scc-ts-binary-abi.md) を参照する。既定 compatibility profile は Small-C、SDCC `__sdcccall(0)` は将来の optional profile として管理する。
non-scalar array element と2-D aggregate array の実装設計は [scc-ts-array-element-design.md](./scc-ts-array-element-design.md) を参照する。

## Status

| mark | meaning |
| --- | --- |
| `S` | TypeScript source path で parser/semantic/lowering を通り、adapter runtime test がある |
| `P` | 一部の宣言位置、型、式形、または runtime evidence が未完了 |
| `N` | 現行 C Subset の未実装。意図的 reject もここへ置き、理由を記録する |
| `-` | その層が feature に適用されない |

`Runtime` は `packages/c-compiler/src/scc/__tests__/tsCompilerAdapter.test.ts` の CP/M link/run test を指す。`Unit` は parser/semantic/lowering の unit test を指す。

## Scope

### Supported scalar model

- `char` は 8-bit、`int` は 16-bit。
- `signed`/`unsigned`、`short` は現行 width へ正規化する構文互換であり、C の完全な signedness/conversion semantics は対象外。
- `void` return、scalar pointer、aggregate pointer、現行 function pointer ABI を対象にする。

### Explicitly out of scope

- `long`、浮動小数点、complex、atomic、bit-field、flexible array member。
- `goto`/label、VLA、compound literal、designated initializer。
- Full preprocessor、完全な linkage/storage-duration、ISO C の全 conversion rule。

これらは `N` だが、失敗時は legacy compiler へ自動フォールバックせず TypeScript compiler の診断として扱う。

## C Subset Feature Matrix

| id | feature | Parser | Semantic | Lowering/emit | Runtime | status | scope / remaining boundary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | `void`, `char`, `int`, normalized `short`/signedness aliases | S | S | S | S | S | fixed 8/16-bit model |
| T02 | scalar/aggregate pointers, address-of, dereference | S | S | S | S | S | covered pointer forms only |
| T03 | 1-D `char[N]` / `int[N]` local/global/parameter arrays | S | S | S | S | S | sized arrays; unsized parameter decay only |
| T04 | 2-D `char[M][N]` / `int[M][N]` | S | S | S | S | S | local/global brace initialization, row decay, `a[i][j]`, and `T (*)[N]` parameter paths are runtime-covered |
| T05 | 3-D+ arrays | S | S | S | S | S | fixed positive decimal-literal dimensions use a recursive descriptor. CP/M runtime has one independent 3-D and 4-D cell for every scalar/pointer/function-pointer/aggregate × local/global/parameter/aggregate-field/typedef combination. VLA、非リテラル/zero bound、先頭以外の unsized bound、flexible array member は診断対象。 |
| T06 | array-like values: decay pointer, `T (*)[N]`, array field/parameter | S | S | S | S | S | current `char`/`int` and `struct (*)[N]` p2a, aggregate field initializer/equality, and parameter paths are runtime-covered |
| T07 | non-scalar array elements: aggregate/pointer/function-pointer arrays | S | S | S | S | S | 1-D/2-D に加え、3-D/4-D の pointer/function-pointer/aggregate について local/global/parameter/field/typedef の independent CP/M runtime matrix を実証済み。aggregate cell は assignment/by-value return consumer、function-pointer cell は indirect call、pointer cell は dereference を含む。 |
| D01 | local, parameter, and file-scope declarations | S | S | S | S | S | current scalar/pointer/aggregate subset |
| D02 | `extern`, `static`, `typedef`, qualifiers | S | S | S | S | S | file-scope `extern` data/functions and internal-linkage `static` data/functions, including same-named static definitions in separate TS source modules, plus scalar/pointer/aggregate/array static locals including `for` initializer declarations with one-time data initialization are runtime-covered; qualifiers are preserved through declarations and semantic types, and writes through supported const-qualified lvalues are rejected. `volatile` / `restrict` preserve type metadata only; volatile access ordering and restrict alias analysis remain outside the Subset. |
| D03 | struct/union definitions, members, nested fields | S | S | S | S | S | covered layout and lvalue paths |
| D04 | enum constants and scalar/pointer typedef aliases | S | S | S | S | S | enum is normalized to int |
| D05 | complex declarators, function-pointer, and internal variadic surface | S | S | S | S | S | balanced function-pointer declarators cover named/abstract callback parameters, typedef/local/global/field/parameter/return forms, including arbitrary fixed trailing array dimensions. Internal direct/static and function-pointer variadic calls use the dedicated right-to-left slot ABI. `va_list` / `va_start` / `va_arg` / `va_end` support `char`/`int`/scalar-pointer/function-pointer slots and CP/M runtime evidence. External variadic linkage, variadic aggregate arguments, function-returning-function, function/array return, and VLA remain out of scope. |
| I01 | scalar and string-literal initialization | S | S | S | S | S | string literal support is char-array only |
| I02 | local/file-scope aggregate brace initialization and zero fill | S | S | S | S | S | covered nested current layouts, row-braced 2-D aggregate arrays, and local/file-scope fully flat 2-D arrays of scalar/pointer/function-pointer, nested-struct, and scalar-like array-field structs; union flat initializers remain explicitly braced |
| I03 | arbitrary nested/designated/compound-literal initialization | N | N | N | N | N | outside current initializer model |
| E01 | integer arithmetic, shifts, bitwise, comparisons | S | S | S | S | S | current char/int widths |
| E02 | logical operators, conditional, comma, assignment expressions | S | S | S | S | S | short-circuit covered; aggregate lvalue result remains separate |
| E03 | scalar/pointer casts and `sizeof` | S | S | S | S | S | aggregate casts and full type coverage excluded |
| E04 | array/pointer subscripting and lvalue update | S | S | S | S | S | 1-D/2-D scalar, aggregate-element, pointer-element, and function-pointer-element local/global/parameter paths, including aggregate `T (*)[N]` lvalues, are covered |
| E05 | struct/union field read/write/address/incdec | S | S | S | S | S | scalar/pointer field operations plus aggregate-field destinations through direct, nested, pointer, and conditional bases |
| E06 | aggregate values through assignment/call/return/conditional/comma | S | S | S | S | S | dedicated producer/destination path; call result writes directly to local/global/aggregate-field destinations. A nested aggregate return call uses one ABI temporary because its hidden return pointer is stack-relative |
| E07 | aggregate compare/truthiness and general aggregate lvalue expression result | N | N | N | N | N | intentional reject. Aggregate assignment expressions are supported through X19; arbitrary aggregate lvalue expressions remain outside the value model. |
| C01 | direct calls, scalar/pointer arguments and returns | S | S | S | S | S | current stack ABI |
| C02 | struct/union argument and return producers | S | S | S | S | S | copy/temporary ABI is runtime-covered |
| C03 | indirect function calls | S | S | S | S | S | local/file-scope/function-pointer-array/function-pointer-typedef/nested typedef/extern/static variable-or-array/`F *`+ / function-pointer-return target forms, including higher-order callback signatures and internal variadic signatures, scalar/pointer/aggregate by-value arguments, and aggregate returns are runtime-covered |
| C04 | recursion | S | S | S | S | S | scalar direct recursion runtime-covered |
| S01 | expression/compound statements, blocks, lexical scopes | S | S | S | S | S | current nesting limit applies |
| S02 | `if`/`else`, `switch`/`case`, `while`, `do`, `for` | S | S | S | S | S | case labels are integer literals; control nesting is capped |
| S03 | `break` / `continue` | S | S | S | S | S | valid loop/switch contexts only |
| S04 | `goto` / label | N | N | N | N | N | intentionally not implemented |
| P01 | bundled-header preprocessing | P | - | - | P | P | quoted/angle bundled `#include`、object-like `#define`、include guard、`#ifdef`/`#ifndef`/`#if defined`/`#else`/`#endif` は TS source path で対応する。function-like macro、arbitrary system header、`#undef`、一般 `#if` expression は明示診断であり、full preprocessor は対象外。 |
| A01 | `.scc.asm`, translation, assembly, link, CP/M execution | S | - | S | S | S | source-path adapter evidence only |

## Expression Syntax and Operand Matrix

この節は「構文を parse できる」ことと「その operand/type 組合せを source path で実行できる」ことを分ける。
`allowed operands / lvalues` 列は現在 `S` と判定する組合せのみを列挙する。C の標準で許されても列挙外の組合せは `P` または `N` とする。

### Expression x Value-Type Matrix

値カテゴリを列にした正本 matrix。配列は次元と array-like 搬送形態を分ける。`scalar` は current 8/16-bit char/int model、`array-like` は decay pointer、sized pointer-to-array、array field/parameter、`agg value` は dedicated producer/consumer path を指す。

| expression family | scalar | pointer | 1-D array | 2-D array | 3-D+ array | array-like | aggregate lvalue | aggregate value | function pointer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| literal / identifier read | S | S | S | S | S | S | S | S | S |
| unary `+ - ~ !` | S | N | N | N | N | N | N | N | N |
| address-of `&` | S | S | S | S | S | S | S | S | S |
| dereference `*` | N | S | N | N | N | S | S | N | N |
| `sizeof` | S | S | S | S | S | S | S | N | S |
| scalar cast | S | S | N | N | N | N | N | N | N |
| arithmetic / shift / bitwise | S | N | N | N | N | N | N | N | N |
| pointer `+/-` integer | N | S | N | S | S | S | N | N | N |
| relational / equality | S | S | N | N | N | S | N | N | N |
| logical truthiness | S | S | N | N | N | S | N | N | S |
| conditional `?:` | S | S | N | S | S | S | N | S | S |
| comma | S | S | N | S | S | S | N | S | S |
| assignment expression | S | S | N | N | N | S | S | S | S |
| compound assignment | S | S | N | N | N | S | N | N | N |
| prefix/postfix incdec | S | S | N | N | N | S | N | N | N |
| subscript / indexed lvalue | N | S | S | S | S | S | S | S | N |
| member `.` / `->` | N | S | N | N | N | S | S | S | N |
| direct call | - | - | - | - | - | - | - | - | - |
| indirect call target | N | N | N | N | N | N | N | N | S |
| call argument | S | S | S | S | S | S | S | S | S |
| return expression | S | S | N | N | N | S | N | S | S |

Matrix notes:

- `1-D array` は実体の `char[N]` / `int[N]`、`2-D array` と `3-D+ array` は実体の配列次元を表す。固定長の任意次元は内部の次元列と remaining-dimension stride で処理する。VLA、非リテラル bound、および後続 unsized bound は明示的に reject する。
- `array-like` の `S` は `char[N]` / `int[N]` の decay、`char (*)[N]` / `int (*)[N]`、array field/parameter の current supported forms を指す。array value を一般値として操作する意味ではない。
- `array-like` は全固定次元・current element type の decay pointer / pointer-to-array transport を表す。配列実体の assignment、compare、incdec は C の不正操作として `N` である。
- aggregate assignment、conditional、comma、call return は型付き aggregate value producer として field read、field address、by-value argument、return、assignment destination に接続する。aggregate producer member address は dedicated temporary/destination path で実装する。
- `direct call` は値カテゴリではなく function symbol 構文を target とするため全列 `-`。function pointer target は `indirect call target` 行で扱う。
- `member` 行の `S` は aggregate object/pointer/value を base にする field read/address/call と array-field decay を指す。function pointer 単体は member base ではない。

| id | syntax | allowed operands / lvalues | Parser | Semantic | Lowering/emit | Runtime | status | remaining boundary |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| X01 | integer/character literal | decimal integer, character literal | S | S | S | S | S | current char/int width only |
| X02 | string literal | call argument, `char[N]` initializer | S | S | S | S | S | general string object/expression rules are partial |
| X03 | identifier expression | scalar, pointer, array decay, function symbol | S | S | S | S | S | aggregate object value uses producer path instead of scalar Expr |
| X04 | parentheses | every supported expression | S | S | S | S | S | parser-specific precedence subset |
| X05 | unary `+`, `-`, `~`, `!` | char/int scalar expressions | S | S | S | S | S | no floating/long semantics |
| X06 | unary `&` | local/global scalar, array element, aggregate field, dereference, array field | S | S | S | S | S | `&(&x)` and arbitrary temporary address are reject |
| X07 | unary `*` | scalar/aggregate/pointer-to-array pointer expression | S | S | S | S | S | pointee must be supported type |
| X08 | `sizeof(type)` / `sizeof expr` | current scalar, pointer, array, aggregate types | S | S | S | S | S | incomplete/VLA/full type classes are excluded |
| X09 | cast `(T)expr` | scalar and supported pointer conversions | S | S | S | S | S | aggregate casts and full C conversion rules are N |
| X10 | `+`, `-`, `*`, `/`, `%` | char/int scalar operands | S | S | S | S | S | no long/float; helper-backed operations where required |
| X11 | `+`, `-` pointer arithmetic | scalar pointer plus/minus int; pointer-to-array plus/minus int | S | S | S | S | S | scales char=1, int=2, aggregate row=`N * sizeof(struct/union element)` |
| X12 | pointer difference | compatible `char *`, `int *`, aggregate pointer, `char (*)[N]` / `int (*)[N]` | S | S | S | S | S | byte, word, aggregate-layout, and non-power-of-two row strides are runtime-covered; function pointer subtraction is outside C's object-pointer operation |
| X13 | `<<`, `>>`, `&`, `|`, `^` | char/int scalar operands | S | S | S | S | S | current integer widths only |
| X14 | `<`, `<=`, `>`, `>=` | char/int and current pointer operands | S | S | S | S | S | aggregate operands are N |
| X15 | `==`, `!=` | char/int, scalar/aggregate pointers, matching `char (*)[N]` / `int (*)[N]` | S | S | S | S | S | matching current pointer-to-array bounds are runtime-covered |
| X16 | `&&`, `||` | scalar/pointer truthy operands | S | S | S | S | S | aggregate truthiness is intentional reject |
| X17 | `cond ? a : b` | scalar, compatible pointer, aggregate producer values | S | S | S | S | S | aggregate lvalue branch is not a general lvalue expression |
| X18 | `(a, b)` | scalar, pointer, aggregate producer values | S | S | S | S | S | aggregate lvalue result is not generalized |
| X19 | `lhs = rhs` expression | local/global scalar/pointer, supported array/member/deref lvalue, aggregate producer destination | S | S | S | S | S | aggregate producer assignment results cover local/global, aggregate field/nested field, aggregate array element, and dereference destinations; destination address is evaluated once |
| X20 | `op=` expression | scalar/pointer arithmetic lvalue, array/member/deref element | S | S | S | S | S | aggregate compound assignment is N |
| X21 | prefix/postfix `++` / `--` | scalar/pointer, array element, supported field/deref lvalue | S | S | S | S | S | aggregate object inc/dec is N |
| X22 | `a[i]` | fixed-dimensional scalar/pointer/function-pointer/aggregate arrays and sized pointer-to-array row element | S | S | S | S | S | 1-D through 4-D local/global/parameter/field/typedef cells are runtime-covered |
| X23 | `a[row][column]`, `p[row][column]`, `(*p)[i]` | fixed-dimensional arrays and recursive `T (*)[D1]...[Dn]` | S | S | S | S | S | 2-D through 4-D p2a parameter, field decay, and postfix chains are runtime-covered |
| X24 | `.`, `->` field read | aggregate lvalue, pointer, conditional/deref base, aggregate producer | S | S | S | S | S | supported field type required |
| X25 | field array index | fixed-dimensional array fields and aggregate-element field bases | S | S | S | S | S | 3-D/4-D scalar/pointer/function-pointer/aggregate field cells preserve full trailing descriptors |
| X26 | field function-pointer call | `x.fp(args)`, `p->fp(args)`, aggregate producer field | S | S | S | S | S | direct/pointer/parameter/typedef/aggregate-producer field targets and scalar argument ABI are runtime-covered |
| X27 | direct call `f(args)` | supported scalar/pointer/aggregate arguments and returns | S | S | S | S | S | internal variadic calls use the dedicated right-to-left ABI; external variadic linkage is N |
| X28 | indirect call `fp(args)`, `(*p)(args)`, `f()(args)` | local/file-scope/function-pointer field target, `F *`+, function-pointer return | S | S | S | S | S | multi-level `F *` local/array/parameter, typedef field targets, plus 3-D/4-D local/global/parameter/field/typedef function-pointer element calls are runtime-covered |
| X29 | aggregate producer expression | aggregate ref, call, assignment result, conditional, comma | S | S | S | S | S | dedicated producer/consumer representation |
| X30 | aggregate consumer | field read/address, call argument, initializer, return | S | S | S | S | S | not a general scalar-expression conversion |
| X31 | unsupported expression forms | compound literal, statement expression, generic selection, `typeof`, floating literal | N | N | N | N | N | outside current C Subset |

### Expression Rejection Policy

- `struct`/`union` compare and truthiness are intentional semantic rejects, not parser omissions.
- Array and aggregate temporaries are only accepted where an explicit producer/consumer or address path exists; they are not implicitly coerced into scalar values.
- Pointer compatibility is structural for the current supported pointee types. The compiler rejects unsupported pointer/array type combinations instead of silently lowering with byte stride.
- A `P` row must name the missing declaration/type/ABI combination and gain a source-path runtime test before it becomes `S`.

## Confirmation Rules

1. 新しい feature は matrix に行を追加し、`P` で着手する。
2. `S` へ移すには parser/semantic/lowering のいずれかの unit evidence と source-path runtime test を追加する。
3. runtime 実行不能な feature は理由を `scope / remaining boundary` に記録し、`P` のままにする。
4. 意図的 reject は `N` に留め、診断テストを追加する。未実装と誤認しない。
5. fixture または external SCC compiler の成功だけでは matrix を更新しない。

## Immediate Backlog

1. `D02`: qualifier を型モデルへ保持し、`const` object / pointer-to-const への書込みを診断する。
2. `D05` の残境界: function-returning-function は C の不正宣言として診断し、VLA、external variadic linkage、variadic aggregate argument は現行 grammar/ABI の対象外である。固定長 3-D+ declarator は `T05` の対象である。
3. `E07`: aggregate compare/truthiness と一般 aggregate lvalue expression result を Subset の意図的 reject として維持するか、一般 expression model の対象にするか決定する。
4. ABI: Small-C external object interoperability、register preservation、pointer-return / recursive aggregate-return の境界を明文化・実証する。

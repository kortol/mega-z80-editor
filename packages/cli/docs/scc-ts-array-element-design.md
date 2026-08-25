# TsSccCompiler Array Element Design

更新日: 2026-08-24

## Goal

`TsSccCompiler` の array model を scalar element 専用実装から、scalar、pointer、function pointer、aggregate を要素にできる model へ拡張する。

最初の完了単位は `struct S a[M][N]` の source path である。次を CP/M runtime test で確認する。

- `a[i][j].field` の read/write
- `&a[i][j]` と `struct S *` parameter
- `a[i][j] = value` の aggregate assignment
- local、file-scope global、parameter の各 storage path

3次元以上は内部 model が表現可能でも C Subset では parser/semantic boundary で reject する。2次元の pointer/function-pointer/aggregate element array は scalar 2-D と同じ element-address model に乗せる。local/file-scope initializer と element consumer の source-path runtime evidence を持つが、parameter declarator の一部は `P` とする。

## Type Model

### Source and semantic types

array type は outer length と trailing dimensions を持つ現在の表現を維持し、element descriptor を追加する。

```ts
type ArrayElementType = ScalarType | PointerTypeRef | FunctionPointerTypeRef | AggregateTypeRef;

type SourceArrayType = {
  kind: "array";
  element: ArrayElementType;
  length?: number;
  dimensions?: number[]; // C Subset: at most one trailing dimension
};
```

`int a[2][3]` は outer length `2`、trailing dimensions `[3]`、element `int` とする。`struct S a[2][3]` も同じ shape で element だけが `struct S` になる。

semantic type は element の storage size を解決済みにする。array 全体の storage size は次式で決める。

```text
sizeof(array) = product([length, ...dimensions]) * sizeof(element)
rowStride     = product(dimensions) * sizeof(element)
```

### Decay and pointer types

- `T a[N]` は `T *` へ decay する。
- `T a[M][N]` は `T (*)[N]` へ decay する。
- `a[i]` が inner array のときも `T *` へ decay する。
- `&a[i][j]` は `T *`、`&a[i]` は `T (*)[N]`。

`T` は scalar、pointer、function pointer、aggregate のいずれでもよい。pointer compatibility は element descriptor と dimensions を比較する。

## Value Categories

| expression | result category | example |
| --- | --- | --- |
| `a` | array decay pointer | `struct S (*)[N]` |
| `a[i]` for 1-D `struct S[]` | aggregate lvalue | `struct S` storage |
| `a[i]` for 2-D | inner array lvalue/decay source | `struct S[N]` |
| `a[i][j]` | aggregate lvalue | `struct S` storage |
| `a[i][j].field` | field lvalue/value | scalar, pointer, array-field, function pointer |
| `&a[i][j]` | pointer value | `struct S *` |

Aggregate lvalue は scalar `BoundExpr` へ暗黙変換しない。既存 aggregate producer/consumer model を使用し、field read、address-of、call argument、initializer、return、assignment の各 consumer を明示的に通す。

## Element Address IR

既存の `localArrayElement`、`globalArrayElement`、`paramArrayElement` は byte/word scalar の fast path として維持する。非スカラーと2次元は新しい address-first node を使用する。

```ts
type ArrayElementAddress = {
  kind: "arrayElementAddress";
  base: BoundExpr;          // array storage address or decayed parameter pointer
  indices: BoundExpr[];
  element: SemanticElementType;
  dimensions: number[];
  type: SemanticPointerType; // pointer to element
};
```

lowering は各 index を左から順に適用する。outer index は row stride、最後の index は element size を scale とする。aggregate field offset は必ず byte offset として追加し、array index scale と混在させない。

```text
address(a[i][j]) = base(a) + i * (N * sizeof(T)) + j * sizeof(T)
```

scalar element は `arrayElementAddress` の dereference を byte/word IR へ最適化してよい。aggregate element は address を aggregate lvalue consumer へ直接渡し、temp local materialization を要求しない。

## Parser and Declarators

対応する宣言子を次の順で追加する。

1. `struct S a[N]`, `struct S a[M][N]`
2. `struct S (*p)[N]`, `struct S a[][N]` parameter
3. `T *a[N]`, `struct S *a[N]`
4. `int (*fp[N])(int)`

`typedef char (*Callback)(char);`、`typedef Callback *CallbackRef;` と `typedef char (*Callbacks[N])(char);` は local、file-scope、parameter、return、`extern Callback symbol;` / `extern Callback symbols[N];` の基底型として対応する。`Callback *` 以上の多段 pointer は local、array element、parameter と `(*p)(...)` / `(**p)(...)` の indirect call まで source-path runtime-covered である。

postfix expression は generic postfix chain として parse する。少なくとも以下を同じ AST path に正規化する。

```c
a[i][j].field
(&a[i][j])->field
(*(cond ? p : q))[i].field
fp[i](x)
```

文字列 regex ごとの専用 AST node を増やさず、`subscript(base, index)`、`member(base, field)`、`call(target, args)` の generic node へ段階的に集約する。既存 AST の互換 node は parser adapter で作る。

## Initialization

initializer は element descriptor に従って再帰的に flatten する。

- scalar array: current byte/word list and string rules
- pointer/function-pointer array: constant `0`、function address、global address relocation
- aggregate array: nested brace list、zero fill、partial initialization

file-scope initializer は data directives を element storage units に合わせて emit する。aggregate element では aggregate initializer flattening を繰り返し、label は array 全体の先頭だけに置く。

compound literal と designated initializer はこの設計の対象外である。

## Delivery Plan

| phase | scope | completion evidence |
| --- | --- | --- |
| A | generic element descriptor、storage size、array element address IR | existing scalar 1-D/2-D tests unchanged |
| B | `struct S a[N]` and `struct S a[M][N]` local/global field read/write and address | source-path runtime tests |
| C | aggregate array parameter, `struct S (*)[N]`, call argument and assignment | source-path runtime tests |
| D | pointer/function-pointer arrays and static initializers | source-path runtime tests |
| E | nested brace initializer and aggregate field arrays | source-path runtime tests and matrix `S`/`P` update |

## Test Matrix

| element | dimension | storage | operations | target status |
| --- | --- | --- | --- | --- |
| scalar | 1-D | local/global/parameter | read/write/address/incdec | S |
| scalar | 2-D | local/global/parameter | `a[i][j]`, row decay, pointer-to-row | S |
| aggregate | 1-D | local/global/parameter | field, address, assignment, call | S |
| aggregate | 2-D | local/global/parameter | field, address, assignment, call, nested brace initializer | S |
| pointer | 1-D | local/global/parameter | read/write/deref/address, brace initializer | S |
| pointer | 2-D | local/global | read/write/deref | S |
| pointer | 2-D | parameter | row decay, read/write/deref | S |
| function pointer | 1-D | local/global | initializer, indirect call | S |
| function pointer | 2-D | local/global | nested brace initializer, indirect call | S |
| function pointer | 1-D parameter | function-pointer array declarator, decay, indirect call | S |
| function pointer | 2-D parameter | row-pointer declarator and indirect call | S |
| pointer to function pointer | local/array/parameter | initializer, multi-level dereference, indirect call | S |

`P` is promoted to `S` only after parser, semantic, lowering evidence and a source-path CP/M runtime test exist. Current evidence includes local/global/parameter 2-D scalar/`struct` brace initialization and element lvalues, aggregate `T (*)[N]` row consumers through conditional/comma/assignment pointer expressions, 1-D pointer-array address initialization, and 1-D/2-D function-pointer relocation/parameter call paths.

## Non-goals

- 3-D and higher source arrays
- VLA and non-literal bounds
- flexible array members
- arbitrary pointer-to-array nesting beyond the declared 2-D Subset
- aggregate compare/truthiness and general aggregate temporary coercion

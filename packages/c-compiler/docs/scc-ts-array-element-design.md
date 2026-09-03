# TsSccCompiler Array Element Design

更新日: 2026-09-02

## Goal

`TsSccCompiler` の array model を scalar element 専用実装から、scalar、pointer、function pointer、aggregate を要素にできる model へ拡張する。

T05 は `S` である。固定長 3-D/4-D について scalar、pointer、function pointer、aggregate × local/global/parameter/aggregate-field/typedef の 40 個の独立 CP/M source-path runtime cell を実証済みである。各 pointer-to-array cell は full trailing-dimension descriptor を保持し、aggregate cell は assignment、by-value call、または aggregate return consumer を含む。

- `a[i][j][k]...field` の read/write
- `&a[i][j][k]...` と recursive `struct S (*)[D1]...[Dn]` parameter
- aggregate array element assignment、by-value call、aggregate return consumer
- local、file-scope global、parameter、aggregate field、typedef の各 declaration path

正の decimal literal bound を持つ固定長配列は任意次元を受理する。pointer/function-pointer/aggregate element array は scalar と同じ element-address model に乗せる。VLA、non-literal/zero bound、先頭以外の unsized bound、flexible array member は診断する。

## Type Model

### Source and semantic types

array type は outer length と trailing dimensions を持つ現在の表現を維持し、element descriptor を追加する。

```ts
type ArrayElementType = ScalarType | PointerTypeRef | FunctionPointerTypeRef | AggregateTypeRef;

type SourceArrayType = {
  kind: "array";
  element: ArrayElementType;
  length?: number;
  dimensions?: number[]; // arbitrary fixed trailing dimensions
};
```

`int a[2][3][4]` は outer length `2`、trailing dimensions `[3, 4]`、element `int` とする。`struct S a[2][3][4]` も同じ shape で element だけが `struct S` になる。

semantic type は element の storage size を解決済みにする。array 全体の storage size は次式で決める。

```text
sizeof(array) = product([length, ...dimensions]) * sizeof(element)
stride(index k) = product(dimensions after k) * sizeof(element)
```

### Decay and pointer types

- `T a[N]` は `T *` へ decay する。
- `T a[D0][D1]...[Dn]` は `T (*)[D1]...[Dn]` へ decay する。
- `a[i]` が inner array のときも full trailing descriptor を保って decay する。
- `&a[i]` は `T (*)[D1]...[Dn]`、最後の添字まで適用した `&a[...]` は `T *`。

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
address(a[i0]...[in]) = base(a) + sum(ik * product(D(k+1)..Dn) * sizeof(T))
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

## Delivery Status

固定長任意次元 model は完了している。`arrayPointer` は remaining dimensions を再帰表現し、named array、typedef、array field、aggregate producer field、parameter decay が同じ descriptor を使用する。

## Test Matrix

| element | dimension | storage | operations | target status |
| --- | --- | --- | --- | --- |
| scalar | 1-D | local/global/parameter | read/write/address/incdec | S |
| scalar | 2-D+ | local/global/parameter/field/typedef | postfix chain, decay, pointer-to-array stride | S |
| aggregate | 1-D | local/global/parameter | field, address, assignment, call | S |
| aggregate | 2-D+ | local/global/parameter/field/typedef | field, address, assignment, call, aggregate-return destination | S |
| pointer | 1-D | local/global/parameter | read/write/deref/address, brace initializer | S |
| pointer | 2-D+ | local/global/parameter/field/typedef | read/write/deref, p2a decay | S |
| function pointer | 1-D | local/global | initializer, indirect call | S |
| function pointer | 2-D+ | local/global/parameter/field/typedef | relocation initializer, p2a decay, indirect call | S |
| pointer to function pointer | local/array/parameter | initializer, multi-level dereference, indirect call | S |

T05 は 4 要素型 × local/global/parameter/field/typedef × 3-D/4-D の 40 個の独立 CP/M source-path test で実証済みである。

## Non-goals

- VLA、non-literal/zero bound、先頭以外の unsized bound
- flexible array members
- aggregate compare/truthiness and general aggregate temporary coercion

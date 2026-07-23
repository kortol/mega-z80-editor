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
- [ ] Phase 10: source subset を実用的な C statement / expression へ広げる

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

## Phase 10 Status

Phase 10 は進行中です。現時点では source-driven path に以下を追加しました。

- additive expression
  - `a + b`
  - `a - b`
  - `x = x + 1`
  - `x = x - 1`
- unary minus
  - `-1`
  - `-a`
  - `-(-64) + x`
- logical not
  - `!a`
  - `!0`
  - `!1`
- logical and/or
  - `a && b`
  - `a || b`
  - `a == b || b == c && c`
- conditional operator
  - `a ? b : c`
  - `a || b ? c : d ? e : f`
  - `*(c ? p : q)`
  - `*(c ? p : 0)`
  - `p = c ? p : q;`
  - `return (p != 0) + ((c ? p : q) == p);`
- `sizeof`
  - `sizeof(char)`
  - `sizeof(int)`
  - `sizeof buf`
  - `sizeof(a)`
- assignment expression
  - `return x = 66;`
  - `return x = y = 3;`
  - `return buf[i] = 65;`
- expression `++/--`
  - `return ++i;`
  - `return i++;`
  - `return ++buf[i];`
  - `return buf[i]--;`
- compound assignment expression
  - `return x += 2;`
  - `return x <<= 1;`
  - `return buf[i] |= 3;`
- comma operator
  - `return x = 1, x += 2, x;`
  - `return (buf[0] = 65, buf[0]);`
- minimal pointer subset
  - `int *p = &x;`
  - `char *q = buf;`
  - `return *p;`
  - `return *q = 65;`
  - `char *p = &buf[i];`
  - `return p[0];`
  - `p[1] = 66;`
  - `return *(p + 1);`
  - `return p[1];`
  - `return (&*p == p) + *(&p[i]);`
  - `return *(p - 1);`
  - `return (p < q) + (p <= q) + (q > p) + (q >= p);`
  - `p += 1;`
  - `p -= 1;`
  - `return *(++p);`
  - `return *(p++);`
  - `return *(--p);`
  - `return *(p--);`
  - `return ++p[i] + p[i]--;`
  - `return (p[i] = z) + (p[i] |= 3);`
  - `return (*p += 2) + (++*p) + ((*p)--);`
  - `++*p;`
  - `*p += 2;`
  - `(*p)--;`
  - `for (; x < 3; ++*p) { break; }`
  - `if (*p) while (*p) { (*p)--; }`
  - `for (; *p; ++p) { break; }`
  - `return p[i];`
  - `return *(p + i);`
  - `p[i] = z;`
  - `*(p + i) = z;`
  - `p == q`
  - `p != q`
  - `p == 0`
  - `0 != p`
  - `if (p) ...`
  - `if (!p) ...`
  - `int second(int *p){ return p[1]; }`
  - `return second(&x);`
  - `int check(struct Foo *p, union Bar *q){ if (p) return q != 0; return p == 0; }`
  - `return (c ? p : q) == p;` for `struct Foo *`
  - `return (c ? p : q)->a + (c ? p : q)->b;`
  - `first(&(c ? p : q)->a)`
  - `second(&(c ? p : q)->b)`
  - `(c ? p : q)->a = 1;`
  - `(c ? p : q)->b += 2;`
  - `++(c ? p : q)->a;`
  - `(c ? p : q)->b--;`
  - `return ((c ? p : q)->a = 4) + (++(c ? p : q)->b) + ((c ? p : q)->a--);`
  - `return (*p).a + (*p).b;`
  - `first(&(*p).a)`
  - `second(&(*p).b)`
  - `return ((*p).a = 4) + (++(*p).b) + ((*p).a--);`
  - `return (*(c ? p : q)).a + first(&(*(c ? p : q)).a) + ((*(c ? p : q)).b = 3) + ((*(c ? p : q)).a--);`
  - `(*(c ? p : q)).a = 1;`
  - `(*(c ? p : q)).b += 2;`
  - `++(*(c ? p : q)).a;`
  - `(*(c ? p : q)).b--;`
  - `struct Foo { char a; int b; };`
  - `union Bar { char a; int b; };`
  - `return sizeof(struct Foo) + sizeof(union Bar);`
  - `struct Foo x;`
  - `return sizeof x;`
  - `return take(&x);`
  - `struct Foo *p = &x;`
  - `return take(p) + (p != 0);`
  - `union Bar x;`
  - `union Bar *p = &x;`
  - `struct Foo *p; p = &x;`
  - `union Bar *p; p = &x;`
  - `struct Foo id(struct Foo x){ return x; }`
  - `struct Foo make(){ struct Foo x; return x; }`
  - `struct Foo y = make();`
  - `y = make();`
  - `take(x)` for aggregate parameter passing
  - `take(make())`
  - `id(make()).a`
  - `struct Foo y = c ? make() : id(make());`
  - `take(c ? make() : y)`
  - `((side = 1), make()).b`
  - `return make().a;`
  - `return (x = make()).a + take(x = make());`
  - `while (i == 0) { struct Foo y = make(); i = y.a; }`
  - `for (; i == 65; i = 66) { struct Foo z = make(); i = z.b; }`
  - `do { struct Foo w = make(); i = w.a; } while (0);`
  - `p = 0;`
  - `if (p) return p != 0;`
  - `if (&x) return &x != 0;`
  - `return sizeof x + (&x != 0);`
  - `return sizeof x + (&x ? 1 : 0);`
  - `return x.a + x.b + u.a + u.b;`
  - `x.a = 1;`
  - `x.b = 2;`
  - `u.a = 3;`
  - `u.b = 4;`
  - `p->a = 1;`
  - `p->b = 2;`
  - `return p->a + p->b + q->a + q->b;`
  - `first(&x.a)`
  - `second(&x.b)`
  - `first(&p->a)`
  - `second(&p->b)`
  - `x.a += 1;`
  - `x.b -= 2;`
  - `++u.a;`
  - `u.b--;`
  - `p->a += 3;`
  - `p->b -= 4;`
  - `++q->a;`
  - `q->b--;`
  - `return (x.a += 3) + (++x.b) + (p->a = 4) + (p->b--);`
  - still rejected: `struct Foo **pp;`
  - still rejected: `union Bar **pp;`
  - still rejected: `&(&x)`
  - still rejected: `return x;` where `x` is `struct`/`union`
  - `x = y;` where `x` and `y` are matching local `struct`/`union`
  - `x = c ? y : z;` where `x`, `y`, `z` are matching local `struct`/`union`
  - `x = (expr, y);` where `x` and `y` are matching local `struct`/`union`
  - `(c ? x : y).field` where `x` and `y` are matching local `struct`/`union`
  - `((expr, y)).field` where `y` is a local `struct`/`union`
  - still rejected: `f(x)` where `x` is `struct`/`union`
  - still rejected: `c ? x : y` where `x`/`y` are `struct`/`union`
  - still rejected: `(x, y)` where `x`/`y` are `struct`/`union`
  - still rejected: `if (x)` where `x` is `struct`/`union`
  - still rejected: `x == 0` where `x` is `struct`/`union`
- bitwise operators
  - `a & b`
  - `a ^ b`
  - `a | b`
- bitwise not
  - `~a`
  - `~190`
- multiplicative operators
  - `a * b`
  - `a / b`
  - `a % b`
- shift operators
  - `c << 1`
  - `c >> 1`
- fixed-size local char arrays
  - `char buf[16];`
  - `fgets(0, 16, buf);`
  - `gets(buf);`
  - `buf[0]`
  - `buf[3]`
  - `buf[i]`
  - `buf[3] = 65;`
  - `buf[i] = x;`
- unsized `char[]` parameters
  - `int emit(char s[]){ outstr(s); return 0; }`
  - subset semantics treat `char s[]` as an address-like argument
  - `char first(char s[]){ return s[0]; }`
  - `int setfirst(char s[]){ s[0] = 66; return 0; }`
- `for` loop
  - `for (x = 65; x < 69; x = x + 1) { ... }`
  - clause omission も可
  - `for (int x = 1; x < 4; x = x + 1) { ... }`
- `do-while` loop
  - `do { ... } while (x < 68);`
  - `do x = x + 1; while (x < 68);`
- `switch` statement
  - `switch (x) { case 65: ... break; default: ... }`
  - integer literal `case`
  - `break` supported
  - fallthrough supported
- control-flow nesting limit
  - compiler-side limit: 8 levels
  - applies to `if` / `while` / `do-while` / `for` / `switch`
- loop control
  - `break`
  - `continue`
- increment / decrement simple statements
  - `x++;`
  - `x--;`
  - `++x;`
  - `--x;`
  - `buf[i]++;`
  - `buf[i]--;`
  - `++buf[i];`
  - `--buf[i];`
- compound assignment simple statements
  - `x += 1;`
  - `x -= 1;`
  - `x *= 2;`
  - `x /= 2;`
  - `x %= 2;`
  - `x &= 7;`
  - `x ^= 1;`
  - `x |= 2;`
  - `x <<= 1;`
  - `x >>= 1;`
  - `buf[i] += x;`
  - `buf[i] -= 3;`
  - `buf[i] *= 2;`
  - `buf[i] &= 7;`
  - `buf[i] |= 2;`
  - `buf[i] <<= 1;`

この時点で source path は `while` だけでなく `for` / `do-while` / `switch` でも control-flow を作れます。test では additive / unary minus / logical not / logical and-or / bitwise / bitwise-not / multiplicative / shift expression、固定長 local char array の constant/dynamic index read-write、`switch` dispatch を inline arithmetic / helper arithmetic / helper compare / short-circuit branch / stack-relative address load へ lower し、`for` + local declaration init + `continue` + `break` + `do-while` + `switch` + `fgets` / `gets` を含む source を CP/M 実行まで確認しています。

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
- inline additive arithmetic
  - source `a + b`, `a - b`, `x = x + 1`, `x = x - 1`
- unary minus
  - source `-1`, `-a`, `-(-64) + x`
- logical not
  - source `!a`, `!0`, `!1`
- logical and/or
  - source `a && b`, `a || b`
- bitwise operators
  - source `a & b`, `a ^ b`, `a | b`
- bitwise not
  - source `~a`, `~190`
- helper-backed multiplicative / shift arithmetic
  - source `a * b`, `a / b`, `a % b`
  - source `c << 1`, `c >> 1`
- local char array address / indexed read-write
  - source `char buf[16];`
  - source `fgets(0, 16, buf)`, `gets(buf)`
  - source `buf[0]`, `buf[3]`
  - source `buf[i]`
  - source `buf[3] = 65`, `buf[i] = x`
- loop / back-edge
  - source `while (x > 48) { outchar(x); x = x - 1; }`
  - source `for (x = 65; x < 69; x = x + 1) { ... }`
  - source `for (int x = 1; x < 4; x = x + 1) { ... }`
  - source `do { outchar(x); x = x + 1; } while (x < 68);`
  - source `break`, `continue`
- switch dispatch
  - source `switch (x) { case 65: ... break; case 66: ... break; default: ... }`
  - source integer literal `case` + `default`

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
- additive expression
  - `return a + b;`
  - `return a - b;`
  - `x = x + 1;`
  - `x = x - 1;`
- unary minus
  - `return -a;`
  - `int x = -1;`
- logical not / and-or
  - `return !a;`
  - `return a && b;`
  - `return a || b;`
- bitwise operators
  - `return a & b;`
  - `return a ^ b;`
  - `return a | b;`
  - `return ~a;`
- multiplicative / shift operators
  - `return a * b;`
  - `return a / b;`
  - `return a % b;`
  - `return c << 1;`
  - `return c >> 1;`
- fixed-size local char arrays
  - `char buf[16];`
  - `fgets(0, 16, buf);`
  - `gets(buf);`
  - `return buf[2];`
  - `buf[2] = 65;`
  - `buf[i] = 65 + i;`
  - `return buf[i];`
- unsized `char[]` parameters
  - `int emit(char s[]){ outstr(s); return 0; }`
  - `char first(char s[]){ return s[0]; }`
  - `int setfirst(char s[]){ s[0] = 66; return 0; }`
- increment / decrement simple statements
  - `i++;`
  - `i--;`
  - `++i;`
  - `--i;`
  - `buf[i]++;`
  - `buf[i]--;`
  - `++buf[i];`
  - `--buf[i];`
- compound assignment simple statements
  - `i += 2;`
  - `i -= 2;`
  - `i *= 4;`
  - `i >>= 1;`
  - `buf[i] += 1;`
  - `buf[i] -= 3;`
  - `buf[i] |= 2;`
- `switch` statement
  - `switch (x) { case 65: return 1; case 66: return 2; default: return 3; }`
  - `switch (x) { case 65: outchar(65); break; default: outchar(67); }`
- `do-while` loop
  - `do { outchar(x); x = x + 1; } while (x < 68);`
  - `do x = x + 1; while (x < 68);`
- branch block with multiple simple statements
  - `int x; if (a > b) { x = 1; return x; } else { x = 0; return x; }`
- brace-wrapped while body
  - `int x = 65; while (x > 90) { x = 66; } return x;`
- single-statement while body
  - `int x = 65; while (x > 90) x = 66; return x;`
- simple `for` loop
  - `for (x = 65; x < 69; x = x + 1) { outchar(x); }`
- `for` with declaration initializer
  - `for (int x = 1; x < 4; x = x + 1) { outchar(x); }`
- loop control
  - `if (x == 66) continue;`
  - `if (x == 67) break;`
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
- full C statement coverage (richer unary/binary operators, pointers, general arrays)

### Full C Coverage Map

`reject` を個別に潰すのではなく、以下の実装パス単位で管理する。

- `Parser`
  - 主要な statement / expression 構文はかなり通っている
  - 現在の主 blocker ではない
- `Semantic lvalue path`
  - local / param / array / pointer / aggregate member の参照、代入、inc/dec はかなり入っている
  - local aggregate 同士の `x = y;` statement copy も入った
- `Aggregate value path`
  - ここが大きく未実装
  - `struct/union` を「式の値」として運べない
- `IR / ABI path`
  - scalar / pointer 前提のままで、aggregate temporary / argument / return の搬送経路がない

### Current Coverage Matrix

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

`aggregate lvalue` は `x`, `*p`, `(c ? p : q)->field` のように storage location を持つ側を指す。
`aggregate value` は `return x`, `f(x)`, `c ? x : y`, `(x, y)` のように一時値として流れる側を指す。
`compare` と `logical truthiness` の aggregate 列は未実装ではなく、`struct/union` を scalar のように比較・条件評価しない方針として `N` を維持する。

2026-07-22 時点の aggregate value 補足:

- compile / lowering path
  - `call / conditional / comma / assign-expression result / field-read / field-address / return pass-through` まで source path で生成できる
- runtime coverage
  - `take(x)`、`take(make())`、`return make().a`、`return (x = make()).a + take(x = make())`、`assign-expression` 経由の aggregate return pass-through は CP/M 実行まで確認済み
  - `conditional` / `comma` をそのまま aggregate-returning function の `return` に流す経路は compile-only では通るが、CP/M 実行では hidden return ABI がまだ不安定
  - したがって matrix 上の aggregate value `return value` は `P` のまま維持する

### Root Blockers

- `tsFrontendSemantic.ts`
  - aggregate value path は `call` / `conditional` / `comma` / assign-expression result / field-read / field-address / return pass-through まで入った
  - ただし aggregate value 自体を scalar expression と同列に扱う汎化はまだない
  - compare / truthiness は intentional reject を維持する
  - assign-expression result は通るようになったが、general aggregate value model への統合はまだない
- `tsProgram.ts`
  - aggregate temporary local slot と aggregate argument / return ABI は導入済み
  - ただし aggregate value 専用の経路が増えており、一般値モデルへの統合は未着手
- `tsFrontendLowering.ts`
  - local aggregate copy, aggregate-valued member read, aggregate call / return ABI は lower 済み
  - branch / conditional / comma / assign-expression result / return pass-through をまたぐ aggregate temporary path は source path で通る
  - ただし aggregate-returning function で `conditional` / `comma` を hidden return slot へ返す runtime ABI は未確定
  - 現状の最小切り分けでは `assign-expression` return pass-through は runtime で通る一方、`conditional` / `comma` は CP/M 実行で不整合が残る

### Implementation Order

1. `aggregate value semantics`
   - `BoundExpr` に aggregate-valued path を入れる
   - local aggregate read を expression として表現できるようにする
2. `aggregate temporary IR`
   - local temporary slot と byte-copy expression lowering を追加する
   - `c ? x : y` と `(x, y)` を aggregate assignment RHS から先に通し、独立 expression へ広げる
3. `aggregate call / return ABI`
   - call argument
   - return value
   - この段階で `f(x)` と `return x;` を解放する
4. `pointer shape expansion`
   - [x] `struct Foo **pp;`
   - [x] `union Bar **pp;`
   - [x] `&p` where `p` is a local pointer
   - [x] `&(&x)` は引き続き reject
5. `remaining C surface`
   - [x] local `char` array string initializers
   - [x] `char buf[] = "AB";` の length 推論
   - [x] `char buf[4] = "AB";` の zero-fill
   - [x] `char buf[2] = "AB";` の exact-fit
   - [x] overflowing string initializer は reject
   - [ ] arrays / unary operators / initializer forms / declarations の残りを広げる

### Phase 10 Exit Criteria

Phase 10 の完了条件は、単に source fixture が減っていることではなく、少なくとも以下を source path で通せることとする。

- aggregate value:
  - `c ? x : y`
  - `(x, y)`
  - `f(x)`
  - `return x;`
  - `return c ? x : y;`
  - `return (x, y);`
- pointer shape:
  - `struct Foo **pp;`
  - `union Bar **pp;`
  - `struct Foo **pp = &p;`
  - `if (pp) return (pp != 0) + (qq != 0);`
- expression completeness:
  - logical / bitwise / compare / additive / multiplicative / shift が source path 上で一通り結合できる
- initializer / declaration completeness:
  - `char buf[] = "AB$";`
  - `char buf[4] = "AB";`
  - `char buf[2] = "AB";`

この slice の残りは、reject 数ではなく「aggregate value path をどこまで通せたか」で評価する。

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

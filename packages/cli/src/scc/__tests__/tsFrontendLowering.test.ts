import { parseProgram } from "../tsFrontendParser";
import { analyzeProgram } from "../tsFrontendSemantic";
import { lowerSourceProgram } from "../tsFrontendLowering";
import { emitProgram } from "../tsProgram";

describe("tsFrontendLowering", () => {
  test("lowers compare expressions and function calls into program spec externs", () => {
    const source = "int flag(int a, int b){ if (a > b) return 1; return 0; }\nint main(){ return flag(66, 65); }\n";
    const parsed = parseProgram(source, "flag.c");
    const bound = analyzeProgram(parsed, source, "flag.c");
    const spec = lowerSourceProgram(bound, "flag.i", source, "flag.c");

    expect(spec.exports).toEqual(["main"]);
    expect(spec.externs).toContain(".gt");
    expect(spec.functions).toHaveLength(2);
  });

  test("keeps branch-local declarations in function local layout", () => {
    const source = "int main(int a, int b){ if (a > b) { int x = 1; return x; } else { int y = 2; return y; } }\n";
    const parsed = parseProgram(source, "branch.c");
    const bound = analyzeProgram(parsed, source, "branch.c");

    expect(bound.functions[0]?.locals.map((local) => local.name)).toEqual(["x", "y"]);
  });

  test("lowers string literals into data records and expression statements into calls", () => {
    const source = "int main(){ outstr(\"HELLO$\"); return 0; }\n";
    const parsed = parseProgram(source, "hello.c");
    const bound = analyzeProgram(parsed, source, "hello.c");
    const spec = lowerSourceProgram(bound, "hello.i", source, "hello.c");

    expect(spec.externs).toContain("outstr");
    expect(spec.data?.[0]?.directive).toBe(".ascii");
    expect(spec.data?.[0]?.value).toBe("\"HELLO$\"");
  });

  test("lowers additive expressions into inline arithmetic ops", () => {
    const source = "int sum(int a, int b){ return a + b; }\nint diff(int a, int b){ return a - b; }\n";
    const parsed = parseProgram(source, "arith.c");
    const bound = analyzeProgram(parsed, source, "arith.c");
    const spec = lowerSourceProgram(bound, "arith.i", source, "arith.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tadd\thl,de");
    expect(asm).toContain("\tsbc\thl,de");
  });

  test("lowers for-loops with continue targets into loop labels", () => {
    const source = "int main(){ int x = 65; for (x = 65; x < 68; x = x + 1) { if (x == 66) continue; outchar(x); } return 0; }\n";
    const parsed = parseProgram(source, "for.c");
    const bound = analyzeProgram(parsed, source, "for.c");
    const spec = lowerSourceProgram(bound, "for.i", source, "for.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tcall\t.lt");
    expect(asm).toContain("\tjp\t.4");
    expect(asm).toContain("\tadd\thl,de");
  });

  test("lowers for-loop declaration initializers and unary minus", () => {
    const source = "int main(){ for (int x = -1; x < 1; x = x + 1) outchar(x + 66); return 0; }\n";
    const parsed = parseProgram(source, "for-decl.c");
    const bound = analyzeProgram(parsed, source, "for-decl.c");
    const spec = lowerSourceProgram(bound, "for-decl.i", source, "for-decl.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tsbc\thl,de");
    expect(asm).toContain("\tld\t(hl),e");
    expect(asm).toContain("\tcall\t.lt");
  });

  test("lowers logical not into an equality helper compare against zero", () => {
    const source = "int main(int a){ return !a; }\n";
    const parsed = parseProgram(source, "not.c");
    const bound = analyzeProgram(parsed, source, "not.c");
    const spec = lowerSourceProgram(bound, "not.i", source, "not.c");
    const asm = emitProgram(spec);

    expect(spec.externs).toContain(".eq");
    expect(asm).toContain("\tcall\t.eq");
    expect(asm).toContain("\tld\thl,#0");
  });

  test("lowers logical and/or with inline short-circuit labels", () => {
    const source = "int main(int a, int b, int c){ return a && b || c; }\n";
    const parsed = parseProgram(source, "logical.c");
    const bound = analyzeProgram(parsed, source, "logical.c");
    const spec = lowerSourceProgram(bound, "logical.i", source, "logical.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tjp\tz,.200");
    expect(asm).toContain("\tjp\tnz,.200");
    expect(asm).toContain("\tld\thl,#1");
  });

  test("lowers ternary conditional expressions with branch labels", () => {
    const source = "int main(int a, int b, int c){ return a ? b : c; }\n";
    const parsed = parseProgram(source, "conditional.c");
    const bound = analyzeProgram(parsed, source, "conditional.c");
    const spec = lowerSourceProgram(bound, "conditional.i", source, "conditional.c");
    const asm = emitProgram(spec);

    expect(asm).toMatch(/\tjp\tz,\.\d+/);
    expect(asm).toMatch(/\tjp\t\.\d+/);
  });

  test("lowers pointer-valued ternary conditional expressions", () => {
    const source = "int main(){ int x = 65; int y = 66; int c = 1; int *p = &x; int *q = &y; return *(c ? p : q) + *(c ? p : 0); }\n";
    const parsed = parseProgram(source, "pointer-conditional.c");
    const bound = analyzeProgram(parsed, source, "pointer-conditional.c");
    const spec = lowerSourceProgram(bound, "pointer-conditional.i", source, "pointer-conditional.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\ta,h/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tor\tl/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("lowers pointer-valued conditional assignment and compare expressions", () => {
    const source = "int main(){ int x = 65; int y = 66; int c = 1; int *p = &x; int *q = &y; p = c ? p : q; return (p != 0) + ((c ? p : q) == p); }\n";
    const parsed = parseProgram(source, "pointer-conditional-assign.c");
    const bound = analyzeProgram(parsed, source, "pointer-conditional-assign.c");
    const spec = lowerSourceProgram(bound, "pointer-conditional-assign.i", source, "pointer-conditional-assign.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tcall\t.eq");
    expect(asm).toContain("\tcall\t.ne");
  });

  test("lowers sizeof expressions as integer constants after semantic folding", () => {
    const source = "int main(int a){ char buf[4]; return sizeof(char) + sizeof buf + sizeof a; }\n";
    const parsed = parseProgram(source, "sizeof.c");
    const bound = analyzeProgram(parsed, source, "sizeof.c");
    const spec = lowerSourceProgram(bound, "sizeof.i", source, "sizeof.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#1");
    expect(asm).toContain("\tld\thl,#4");
    expect(asm).toContain("\tld\thl,#2");
  });

  test("lowers assignment expressions into store-and-return sequences", () => {
    const source = "int main(){ int x; return x = 66; }\n";
    const parsed = parseProgram(source, "assign-expr.c");
    const bound = analyzeProgram(parsed, source, "assign-expr.c");
    const spec = lowerSourceProgram(bound, "assign-expr.i", source, "assign-expr.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\t(hl),e");
    expect(asm).toContain("\tld\t(hl),d");
    expect(asm).toContain("\tex\tde,hl");
  });

  test("lowers array assignment expressions into byte stores that keep the assigned value", () => {
    const source = "int main(){ int i = 1; char buf[4]; return buf[i] = 65; }\n";
    const parsed = parseProgram(source, "array-assign-expr.c");
    const bound = analyzeProgram(parsed, source, "array-assign-expr.c");
    const spec = lowerSourceProgram(bound, "array-assign-expr.i", source, "array-assign-expr.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\t(hl),e");
    expect(asm).toContain("\tld\tl,e");
    expect(asm).toContain("\tld\th,#0");
  });

  test("lowers prefix and postfix increment/decrement expressions with distinct return values", () => {
    const source = "int main(){ int i = 1; char buf[4]; return ++i + buf[i]--; }\n";
    const parsed = parseProgram(source, "incdec-expr.c");
    const bound = analyzeProgram(parsed, source, "incdec-expr.c");
    const spec = lowerSourceProgram(bound, "incdec-expr.i", source, "incdec-expr.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tinc\tde");
    expect(asm).toContain("\tdec\te");
    expect(asm).toContain("\tpush\thl");
  });

  test("lowers compound assignment expressions through store-and-return paths", () => {
    const source = "int main(){ int x = 1; char buf[4]; return x += 2 + (buf[0] |= 3); }\n";
    const parsed = parseProgram(source, "compound-assign-expr.c");
    const bound = analyzeProgram(parsed, source, "compound-assign-expr.c");
    const spec = lowerSourceProgram(bound, "compound-assign-expr.i", source, "compound-assign-expr.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tor\td");
    expect(asm).toContain("\tld\t(hl),e");
    expect(asm).toContain("\tld\t(hl),d");
  });

  test("lowers pointer-indexed prefix and postfix increment/decrement expressions", () => {
    const source = "int main(){ int x = 1; int y = 2; int i = 1; int *p = &x; return ++p[i] + p[i]--; }\n";
    const parsed = parseProgram(source, "pointer-index-incdec-expr.c");
    const bound = analyzeProgram(parsed, source, "pointer-index-incdec-expr.c");
    const spec = lowerSourceProgram(bound, "pointer-index-incdec-expr.i", source, "pointer-index-incdec-expr.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toContain("\tpush\tde");
    expect(asm).toContain("\tpop\thl");
  });

  test("lowers pointer-indexed assignment and compound assignment expressions", () => {
    const source = "int main(){ int x = 65; int y = 66; int z = 67; int i = 1; int *p = &x; return (p[i] = z) + (p[i] |= 3); }\n";
    const parsed = parseProgram(source, "pointer-index-assign-expr.c");
    const bound = analyzeProgram(parsed, source, "pointer-index-assign-expr.c");
    const spec = lowerSourceProgram(bound, "pointer-index-assign-expr.i", source, "pointer-index-assign-expr.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toContain("\tor\td");
  });

  test("lowers comma expressions by evaluating left then returning right", () => {
    const source = "int main(){ int x = 0; return x = 1, x += 2, x; }\n";
    const parsed = parseProgram(source, "comma.c");
    const bound = analyzeProgram(parsed, source, "comma.c");
    const spec = lowerSourceProgram(bound, "comma.i", source, "comma.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toContain("\tadd\thl,de");
  });

  test("lowers pointer dereference reads and writes", () => {
    const source = "int main(){ int x = 66; int *p = &x; char buf[2]; char *q = buf; *q = 65; return *p; }\n";
    const parsed = parseProgram(source, "pointer.c");
    const bound = analyzeProgram(parsed, source, "pointer.c");
    const spec = lowerSourceProgram(bound, "pointer.i", source, "pointer.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\ta,(hl)");
    expect(asm).toContain("\tld\t(hl),e");
    expect(asm).toContain("\tld\t(hl),d");
  });

  test("lowers address-of array elements and pointer indexing through pointer adds", () => {
    const source = "int main(){ int i = 1; char buf[3]; char *p = &buf[i]; return p[0]; }\n";
    const parsed = parseProgram(source, "pointer-index.c");
    const bound = analyzeProgram(parsed, source, "pointer-index.c");
    const spec = lowerSourceProgram(bound, "pointer-index.i", source, "pointer-index.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toContain("\tld\tl,(hl)");
  });

  test("lowers address-of dereference cancellation and pointer-index element address", () => {
    const source = "int main(){ int x = 65; int y = 66; int i = 1; int *p = &x; return (&*p == p) + *(&p[i]); }\n";
    const parsed = parseProgram(source, "pointer-address-cancel.c");
    const bound = analyzeProgram(parsed, source, "pointer-address-cancel.c");
    const spec = lowerSourceProgram(bound, "pointer-address-cancel.i", source, "pointer-address-cancel.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tcall\t.eq");
    expect((asm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tld\ta,(hl)");
  });

  test("lowers pointer indexing writes and pointer arithmetic dereference through scaled pointer adds", () => {
    const source = "int main(){ char buf[3]; char *p = buf; p[1] = 66; return *(p + 1); }\n";
    const parsed = parseProgram(source, "pointer-arith.c");
    const bound = analyzeProgram(parsed, source, "pointer-arith.c");
    const spec = lowerSourceProgram(bound, "pointer-arith.i", source, "pointer-arith.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toContain("\tld\t(hl),e");
    expect(asm).toContain("\tld\tl,(hl)");
  });

  test("lowers int pointer indexing and scaled pointer arithmetic with doubled indexes", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &x; return p[1] + *(p + 1); }\n";
    const parsed = parseProgram(source, "int-pointer.c");
    const bound = analyzeProgram(parsed, source, "int-pointer.c");
    const spec = lowerSourceProgram(bound, "int-pointer.i", source, "int-pointer.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toContain("\tld\ta,(hl)");
  });

  test("lowers backward int pointer arithmetic with scaled subtraction", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &y; return *(p - 1); }\n";
    const parsed = parseProgram(source, "int-pointer-backward.c");
    const bound = analyzeProgram(parsed, source, "int-pointer-backward.c");
    const spec = lowerSourceProgram(bound, "int-pointer-backward.i", source, "int-pointer-backward.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tsbc\thl,de");
    expect(asm).toContain("\tadd\thl,hl");
    expect(asm).toContain("\tld\ta,(hl)");
  });

  test("lowers pointer compound assignment through scaled pointer adds and pointer stores", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &x; p += 1; return *p; }\n";
    const parsed = parseProgram(source, "pointer-compound.c");
    const bound = analyzeProgram(parsed, source, "pointer-compound.c");
    const spec = lowerSourceProgram(bound, "pointer-compound.i", source, "pointer-compound.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tadd\thl,hl");
    expect(asm).toContain("\tld\t(hl),e");
    expect(asm).toContain("\tld\t(hl),d");
    expect(asm).toContain("\tld\ta,(hl)");
  });

  test("lowers pointer prefix and postfix increment expressions with scaled word steps", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &x; return *(++p) + *(p++); }\n";
    const parsed = parseProgram(source, "pointer-incdec.c");
    const bound = analyzeProgram(parsed, source, "pointer-incdec.c");
    const spec = lowerSourceProgram(bound, "pointer-incdec.i", source, "pointer-incdec.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tinc\tde/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers pointer prefix and postfix decrement expressions with scaled word steps", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &y; return *(--p) + *(p--); }\n";
    const parsed = parseProgram(source, "pointer-decdec.c");
    const bound = analyzeProgram(parsed, source, "pointer-decdec.c");
    const spec = lowerSourceProgram(bound, "pointer-decdec.i", source, "pointer-decdec.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tdec\tde/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers pointer subtract compound assignment through scaled pointer adds and pointer stores", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &y; p -= 1; return *p; }\n";
    const parsed = parseProgram(source, "pointer-compound-sub.c");
    const bound = analyzeProgram(parsed, source, "pointer-compound-sub.c");
    const spec = lowerSourceProgram(bound, "pointer-compound-sub.i", source, "pointer-compound-sub.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tsbc\thl,de");
    expect(asm).toContain("\tadd\thl,hl");
    expect(asm).toContain("\tld\t(hl),d");
    expect(asm).toContain("\tld\ta,(hl)");
  });

  test("lowers dynamic int pointer indexing and arithmetic with doubled expression indexes", () => {
    const source = "int main(){ int x = 65; int y = 66; int z = 67; int i = 1; int *p = &x; return p[i] + *(p + i); }\n";
    const parsed = parseProgram(source, "int-pointer-dynamic.c");
    const bound = analyzeProgram(parsed, source, "int-pointer-dynamic.c");
    const spec = lowerSourceProgram(bound, "int-pointer-dynamic.i", source, "int-pointer-dynamic.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers dynamic int pointer indexed writes through word dereference stores", () => {
    const source = "int main(){ int x = 65; int y = 66; int z = 67; int i = 1; int *p = &x; p[i] = z; return *(p + i); }\n";
    const parsed = parseProgram(source, "int-pointer-dynamic-write.c");
    const bound = analyzeProgram(parsed, source, "int-pointer-dynamic-write.c");
    const spec = lowerSourceProgram(bound, "int-pointer-dynamic-write.i", source, "int-pointer-dynamic-write.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("lowers pointer equality and inequality compares through helper calls", () => {
    const source = "int main(){ int x = 65; int *p = &x; int *q = &x; return (p == q) + (p != q); }\n";
    const parsed = parseProgram(source, "pointer-compare.c");
    const bound = analyzeProgram(parsed, source, "pointer-compare.c");
    const spec = lowerSourceProgram(bound, "pointer-compare.i", source, "pointer-compare.c");
    const asm = emitProgram(spec);

    expect(spec.externs).toContain(".eq");
    expect(spec.externs).toContain(".ne");
    expect(asm).toContain("\tcall\t.eq");
    expect(asm).toContain("\tcall\t.ne");
  });

  test("lowers pointer and integer equality/inequality compares in both orders through helper calls", () => {
    const source = "int main(){ int x = 65; int *p = &x; return (p == 0) + (0 == p) + (p != 0) + (0 != p); }\n";
    const parsed = parseProgram(source, "pointer-int-compare.c");
    const bound = analyzeProgram(parsed, source, "pointer-int-compare.c");
    const spec = lowerSourceProgram(bound, "pointer-int-compare.i", source, "pointer-int-compare.c");
    const asm = emitProgram(spec);

    expect(spec.externs).toContain(".eq");
    expect(spec.externs).toContain(".ne");
    expect((asm.match(/\tcall\t\.eq/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\t\.ne/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers pointer relational compares through ordered helper calls", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &x; int *q = &y; return (p < q) + (p <= q) + (q > p) + (q >= p); }\n";
    const parsed = parseProgram(source, "pointer-rel-compare.c");
    const bound = analyzeProgram(parsed, source, "pointer-rel-compare.c");
    const spec = lowerSourceProgram(bound, "pointer-rel-compare.i", source, "pointer-rel-compare.c");
    const asm = emitProgram(spec);

    expect(spec.externs).toContain(".lt");
    expect(spec.externs).toContain(".le");
    expect(spec.externs).toContain(".gt");
    expect(spec.externs).toContain(".ge");
    expect(asm).toContain("\tcall\t.lt");
    expect(asm).toContain("\tcall\t.le");
    expect(asm).toContain("\tcall\t.gt");
    expect(asm).toContain("\tcall\t.ge");
  });

  test("lowers pointer truthiness conditions through direct hl zero-tests", () => {
    const source = "int main(){ int x = 65; int *p = &x; if (p) return 1; if (!p) return 2; return 3; }\n";
    const parsed = parseProgram(source, "pointer-truthy.c");
    const bound = analyzeProgram(parsed, source, "pointer-truthy.c");
    const spec = lowerSourceProgram(bound, "pointer-truthy.i", source, "pointer-truthy.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\ta,h");
    expect((asm.match(/\tor\tl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("lowers dereference truthiness in if/while/for conditions", () => {
    const source = "int main(){ int x = 2; int *p = &x; if (*p) while (*p) { (*p)--; } for (; *p; ++p) { break; } return x; }\n";
    const parsed = parseProgram(source, "deref-truthy.c");
    const bound = analyzeProgram(parsed, source, "deref-truthy.c");
    const spec = lowerSourceProgram(bound, "deref-truthy.i", source, "deref-truthy.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tor\tl/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(asm).toContain("\tadd\thl,hl");
    expect(asm).toContain("\tadd\thl,de");
  });

  test("lowers int pointer parameters and calls through pointer args and scaled callee indexing", () => {
    const source = "int second(int *p){ return p[1]; }\nint main(){ int x = 65; int y = 66; return second(&x); }\n";
    const parsed = parseProgram(source, "pointer-param.c");
    const bound = analyzeProgram(parsed, source, "pointer-param.c");
    const spec = lowerSourceProgram(bound, "pointer-param.i", source, "pointer-param.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tcall\tsecond");
    expect(asm).toContain("\tpush\thl");
    expect((asm.match(/\tadd\thl,hl/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tld\ta,(hl)");
  });

  test("lowers opaque struct and union pointer params for compare and truthiness", () => {
    const source = "int check(struct Foo *p, union Bar *q){ if (p) return q != 0; return p == 0; }\n";
    const parsed = parseProgram(source, "aggregate-pointer.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer.c");
    const spec = lowerSourceProgram(bound, "aggregate-pointer.i", source, "aggregate-pointer.c");
    const asm = emitProgram(spec);

    expect(spec.externs).toContain(".eq");
    expect(spec.externs).toContain(".ne");
    expect(asm).toContain("\tld\ta,h");
    expect(asm).toContain("\tcall\t.ne");
    expect(asm).toContain("\tcall\t.eq");
  });

  test("lowers aggregate-pointer-valued conditional expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return (c ? p : q) == p; }\n";
    const parsed = parseProgram(source, "aggregate-pointer-conditional.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer-conditional.c");
    const spec = lowerSourceProgram(bound, "aggregate-pointer-conditional.i", source, "aggregate-pointer-conditional.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toContain("\tcall\t.eq");
    expect(asm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("lowers pointer-member access on conditional pointer expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return (c ? p : q)->a + (c ? p : q)->b; }\n";
    const parsed = parseProgram(source, "aggregate-pointer-member-conditional.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer-member-conditional.c");
    const spec = lowerSourceProgram(bound, "aggregate-pointer-member-conditional.i", source, "aggregate-pointer-member-conditional.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("lowers address-of on pointer-member access from conditional pointer expressions", () => {
    const source = "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return first(&(c ? p : q)->a) + second(&(c ? p : q)->b); }\n";
    const parsed = parseProgram(source, "aggregate-pointer-member-conditional-address.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer-member-conditional-address.c");
    const spec = lowerSourceProgram(bound, "aggregate-pointer-member-conditional-address.i", source, "aggregate-pointer-member-conditional-address.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tcall\tfirst");
    expect(asm).toContain("\tcall\tsecond");
    expect((asm.match(/\tadd\thl,de/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers sizeof aggregate types as integer constants", () => {
    const source = "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ return sizeof(struct Foo) + sizeof(union Bar); }\n";
    const parsed = parseProgram(source, "aggregate-sizeof.c");
    const bound = analyzeProgram(parsed, source, "aggregate-sizeof.c");
    const spec = lowerSourceProgram(bound, "aggregate-sizeof.i", source, "aggregate-sizeof.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#3");
    expect(asm).toContain("\tld\thl,#2");
  });

  test("lowers local aggregate objects for sizeof locals and address-of calls", () => {
    const source = "struct Foo { char a; int b; };\nint take(struct Foo *p){ return p != 0; }\nint main(){ struct Foo x; return sizeof x + take(&x); }\n";
    const parsed = parseProgram(source, "aggregate-local.c");
    const bound = analyzeProgram(parsed, source, "aggregate-local.c");
    const spec = lowerSourceProgram(bound, "aggregate-local.i", source, "aggregate-local.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#3");
    expect(asm).toContain("\tadd\thl,sp");
    expect(asm).toContain("\tcall\ttake");
  });

  test("lowers local aggregate pointers initialized from aggregate object addresses", () => {
    const source = "struct Foo { char a; int b; };\nint take(struct Foo *p){ return p != 0; }\nint main(){ struct Foo x; struct Foo *p = &x; return take(p) + (p != 0); }\n";
    const parsed = parseProgram(source, "aggregate-local-pointer.c");
    const bound = analyzeProgram(parsed, source, "aggregate-local-pointer.c");
    const spec = lowerSourceProgram(bound, "aggregate-local-pointer.i", source, "aggregate-local-pointer.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tcall\ttake");
    expect(asm).toContain("\tcall\t.ne");
    expect(asm).toContain("\tadd\thl,sp");
  });

  test("lowers local union pointers initialized from union object addresses", () => {
    const source = "union Bar { char a; int b; };\nint take(union Bar *p){ return p != 0; }\nint main(){ union Bar x; union Bar *p = &x; return take(p) + (p != 0); }\n";
    const parsed = parseProgram(source, "union-local-pointer.c");
    const bound = analyzeProgram(parsed, source, "union-local-pointer.c");
    const spec = lowerSourceProgram(bound, "union-local-pointer.i", source, "union-local-pointer.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tcall\ttake");
    expect(asm).toContain("\tcall\t.ne");
    expect(asm).toContain("\tadd\thl,sp");
  });

  test("lowers aggregate pointer assignment after declaration", () => {
    const source = "struct Foo { char a; int b; };\nint take(struct Foo *p){ return p != 0; }\nint main(){ struct Foo x; struct Foo *p; p = &x; return take(p) + (p != 0); }\n";
    const parsed = parseProgram(source, "aggregate-pointer-assign.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer-assign.c");
    const spec = lowerSourceProgram(bound, "aggregate-pointer-assign.i", source, "aggregate-pointer-assign.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tcall\ttake");
    expect(asm).toContain("\tcall\t.ne");
    expect(asm).toContain("\tadd\thl,sp");
  });

  test("lowers union pointer assignment after declaration", () => {
    const source = "union Bar { char a; int b; };\nint take(union Bar *p){ return p != 0; }\nint main(){ union Bar x; union Bar *p; p = &x; return take(p) + (p != 0); }\n";
    const parsed = parseProgram(source, "union-pointer-assign.c");
    const bound = analyzeProgram(parsed, source, "union-pointer-assign.c");
    const spec = lowerSourceProgram(bound, "union-pointer-assign.i", source, "union-pointer-assign.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tcall\ttake");
    expect(asm).toContain("\tcall\t.ne");
    expect(asm).toContain("\tadd\thl,sp");
  });

  test("lowers aggregate pointer null assignment and reassignment", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ struct Foo x; struct Foo *p; p = 0; p = &x; if (p) return p != 0; return 0; }\n";
    const parsed = parseProgram(source, "aggregate-pointer-null.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer-null.c");
    const spec = lowerSourceProgram(bound, "aggregate-pointer-null.i", source, "aggregate-pointer-null.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#0");
    expect(asm).toContain("\tadd\thl,sp");
    expect(asm).toContain("\tcall\t.ne");
    expect(asm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("lowers union pointer null assignment and reassignment", () => {
    const source = "union Bar { char a; int b; };\nint main(){ union Bar x; union Bar *p; p = 0; p = &x; if (p) return p != 0; return 0; }\n";
    const parsed = parseProgram(source, "union-pointer-null.c");
    const bound = analyzeProgram(parsed, source, "union-pointer-null.c");
    const spec = lowerSourceProgram(bound, "union-pointer-null.i", source, "union-pointer-null.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#0");
    expect(asm).toContain("\tadd\thl,sp");
    expect(asm).toContain("\tcall\t.ne");
    expect(asm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("lowers direct aggregate address compares and truthiness", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ struct Foo x; if (&x) return &x != 0; return 0; }\n";
    const parsed = parseProgram(source, "aggregate-address-direct.c");
    const bound = analyzeProgram(parsed, source, "aggregate-address-direct.c");
    const spec = lowerSourceProgram(bound, "aggregate-address-direct.i", source, "aggregate-address-direct.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tadd\thl,sp");
    expect(asm).toContain("\tcall\t.ne");
    expect(asm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("lowers direct union address compares and truthiness", () => {
    const source = "union Bar { char a; int b; };\nint main(){ union Bar x; if (&x) return &x != 0; return 0; }\n";
    const parsed = parseProgram(source, "union-address-direct.c");
    const bound = analyzeProgram(parsed, source, "union-address-direct.c");
    const spec = lowerSourceProgram(bound, "union-address-direct.i", source, "union-address-direct.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tadd\thl,sp");
    expect(asm).toContain("\tcall\t.ne");
    expect(asm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("lowers mixed aggregate sizeof and direct address compare expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ struct Foo x; return sizeof x + (&x != 0); }\n";
    const parsed = parseProgram(source, "aggregate-mixed-expr.c");
    const bound = analyzeProgram(parsed, source, "aggregate-mixed-expr.c");
    const spec = lowerSourceProgram(bound, "aggregate-mixed-expr.i", source, "aggregate-mixed-expr.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#3");
    expect(asm).toContain("\tadd\thl,sp");
    expect(asm).toContain("\tcall\t.ne");
  });

  test("lowers mixed union sizeof and direct address conditional expressions", () => {
    const source = "union Bar { char a; int b; };\nint main(){ union Bar x; return sizeof x + (&x ? 1 : 0); }\n";
    const parsed = parseProgram(source, "union-mixed-expr.c");
    const bound = analyzeProgram(parsed, source, "union-mixed-expr.c");
    const spec = lowerSourceProgram(bound, "union-mixed-expr.i", source, "union-mixed-expr.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#2");
    expect(asm).toContain("\tadd\thl,sp");
    expect(asm).toMatch(/\tjp\tz,\.\d+/);
  });

  test("lowers local struct and union member reads", () => {
    const source = "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ struct Foo x; union Bar u; return x.a + x.b + u.a + u.b; }\n";
    const parsed = parseProgram(source, "aggregate-member-read.c");
    const bound = analyzeProgram(parsed, source, "aggregate-member-read.c");
    const spec = lowerSourceProgram(bound, "aggregate-member-read.i", source, "aggregate-member-read.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tadd\thl,sp/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(asm).toContain("\tld\tl,(hl)");
    expect(asm).toContain("\tld\th,(hl)");
  });

  test("lowers local struct and union member writes", () => {
    const source = "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ struct Foo x; union Bar u; x.a = 1; x.b = 2; u.a = 3; u.b = 4; return x.a + x.b + u.a + u.b; }\n";
    const parsed = parseProgram(source, "aggregate-member-write.c");
    const bound = analyzeProgram(parsed, source, "aggregate-member-write.c");
    const spec = lowerSourceProgram(bound, "aggregate-member-write.i", source, "aggregate-member-write.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\t(hl),e");
    expect(asm).toContain("\tinc\thl");
    expect((asm.match(/\tadd\thl,sp/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  test("lowers aggregate pointer member reads and writes", () => {
    const source = "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(struct Foo *p, union Bar *q){ p->a = 1; p->b = 2; q->a = 3; q->b = 4; return p->a + p->b + q->a + q->b; }\n";
    const parsed = parseProgram(source, "aggregate-pointer-member.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer-member.c");
    const spec = lowerSourceProgram(bound, "aggregate-pointer-member.i", source, "aggregate-pointer-member.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tinc\thl/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test("lowers address-of on aggregate fields", () => {
    const source = "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(struct Foo *p){ struct Foo x; return first(&x.a) + second(&x.b) + first(&p->a) + second(&p->b); }\n";
    const parsed = parseProgram(source, "aggregate-field-address.c");
    const bound = analyzeProgram(parsed, source, "aggregate-field-address.c");
    const spec = lowerSourceProgram(bound, "aggregate-field-address.i", source, "aggregate-field-address.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tfirst/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\tsecond/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tadd\thl,sp/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers dereferenced aggregate member reads and address-of", () => {
    const source = "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(struct Foo *p){ return (*p).a + (*p).b + first(&(*p).a) + second(&(*p).b); }\n";
    const parsed = parseProgram(source, "aggregate-deref-member-read.c");
    const bound = analyzeProgram(parsed, source, "aggregate-deref-member-read.c");
    const spec = lowerSourceProgram(bound, "aggregate-deref-member-read.i", source, "aggregate-deref-member-read.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tfirst/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tsecond/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("lowers aggregate field compound assignments and incdec statements", () => {
    const source = "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(struct Foo *p, union Bar *q){ struct Foo x; union Bar u; x.a += 1; x.b -= 2; ++u.a; u.b--; p->a += 3; p->b -= 4; ++q->a; q->b--; return x.a + x.b + u.a + u.b + p->a + p->b + q->a + q->b; }\n";
    const parsed = parseProgram(source, "aggregate-field-ops.c");
    const bound = analyzeProgram(parsed, source, "aggregate-field-ops.c");
    const spec = lowerSourceProgram(bound, "aggregate-field-ops.i", source, "aggregate-field-ops.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test("lowers aggregate field assignment expressions and incdec expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(struct Foo *p){ struct Foo x; return (x.a += 3) + (++x.b) + (p->a = 4) + (p->b--); }\n";
    const parsed = parseProgram(source, "aggregate-field-expr-ops.c");
    const bound = analyzeProgram(parsed, source, "aggregate-field-expr-ops.c");
    const spec = lowerSourceProgram(bound, "aggregate-field-expr-ops.i", source, "aggregate-field-expr-ops.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toContain("\tpush\tde");
    expect(asm).toContain("\tpop\thl");
  });

  test("lowers pointer-member writes on conditional pointer expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; (c ? p : q)->a = 1; (c ? p : q)->b += 2; return x.a + x.b + y.a + y.b; }\n";
    const parsed = parseProgram(source, "aggregate-pointer-member-conditional-write.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer-member-conditional-write.c");
    const spec = lowerSourceProgram(bound, "aggregate-pointer-member-conditional-write.i", source, "aggregate-pointer-member-conditional-write.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tjp\t\.\d+/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers pointer-member incdec on conditional pointer expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; ++(c ? p : q)->a; (c ? p : q)->b--; return x.a + x.b + y.a + y.b; }\n";
    const parsed = parseProgram(source, "aggregate-pointer-member-conditional-incdec.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer-member-conditional-incdec.c");
    const spec = lowerSourceProgram(bound, "aggregate-pointer-member-conditional-incdec.i", source, "aggregate-pointer-member-conditional-incdec.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("lowers pointer-member assignment and incdec expressions on conditional pointer expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return ((c ? p : q)->a = 4) + (++(c ? p : q)->b) + ((c ? p : q)->a--); }\n";
    const parsed = parseProgram(source, "aggregate-pointer-member-conditional-expr-ops.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer-member-conditional-expr-ops.c");
    const spec = lowerSourceProgram(bound, "aggregate-pointer-member-conditional-expr-ops.i", source, "aggregate-pointer-member-conditional-expr-ops.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tpush\tde");
    expect(asm).toContain("\tpop\thl");
  });

  test("lowers dereferenced aggregate member assignment and incdec expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(struct Foo *p){ return ((*p).a = 4) + (++(*p).b) + ((*p).a--); }\n";
    const parsed = parseProgram(source, "aggregate-deref-member-expr-ops.c");
    const bound = analyzeProgram(parsed, source, "aggregate-deref-member-expr-ops.c");
    const spec = lowerSourceProgram(bound, "aggregate-deref-member-expr-ops.i", source, "aggregate-deref-member-expr-ops.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tpush\tde");
  });

  test("lowers dereferenced conditional aggregate pointer member operations", () => {
    const source = "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return (*(c ? p : q)).a + first(&(*(c ? p : q)).a) + ((*(c ? p : q)).b = 3) + ((*(c ? p : q)).a--); }\n";
    const parsed = parseProgram(source, "aggregate-deref-conditional-member-ops.c");
    const bound = analyzeProgram(parsed, source, "aggregate-deref-conditional-member-ops.c");
    const spec = lowerSourceProgram(bound, "aggregate-deref-conditional-member-ops.i", source, "aggregate-deref-conditional-member-ops.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tjp\t\.\d+/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tcall\tfirst");
  });

  test("lowers dereferenced conditional aggregate pointer member statements", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; (*(c ? p : q)).a = 1; (*(c ? p : q)).b += 2; ++(*(c ? p : q)).a; (*(c ? p : q)).b--; return x.a + x.b + y.a + y.b; }\n";
    const parsed = parseProgram(source, "aggregate-deref-conditional-member-stmt.c");
    const bound = analyzeProgram(parsed, source, "aggregate-deref-conditional-member-stmt.c");
    const spec = lowerSourceProgram(bound, "aggregate-deref-conditional-member-stmt.i", source, "aggregate-deref-conditional-member-stmt.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tjp\t\.\d+/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers dereference compound assignment and incdec expressions", () => {
    const source = "int main(){ int x = 1; int *p = &x; return (*p += 2) + (++*p) + ((*p)--); }\n";
    const parsed = parseProgram(source, "pointer-deref-ops.c");
    const bound = analyzeProgram(parsed, source, "pointer-deref-ops.c");
    const spec = lowerSourceProgram(bound, "pointer-deref-ops.i", source, "pointer-deref-ops.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(asm).toContain("\tpush\tde");
    expect(asm).toContain("\tpop\thl");
  });

  test("lowers bitwise expressions into inline bytewise ops", () => {
    const source = "int main(int a, int b){ return (a & b) ^ (a | b); }\n";
    const parsed = parseProgram(source, "bitwise.c");
    const bound = analyzeProgram(parsed, source, "bitwise.c");
    const spec = lowerSourceProgram(bound, "bitwise.i", source, "bitwise.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tand\td");
    expect(asm).toContain("\txor\td");
    expect(asm).toContain("\tor\td");
  });

  test("lowers bitwise not into xor with 65535", () => {
    const source = "int main(int a){ return ~a; }\n";
    const parsed = parseProgram(source, "bitnot.c");
    const bound = analyzeProgram(parsed, source, "bitnot.c");
    const spec = lowerSourceProgram(bound, "bitnot.i", source, "bitnot.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#65535");
    expect(asm).toContain("\txor\td");
  });

  test("lowers multiplicative and shift expressions into helper calls", () => {
    const source = "int main(int a, int b, int c){ return (a * b) + (a / b) + (a % b) + (c << 1) + (c >> 1); }\n";
    const parsed = parseProgram(source, "helpers.c");
    const bound = analyzeProgram(parsed, source, "helpers.c");
    const spec = lowerSourceProgram(bound, "helpers.i", source, "helpers.c");
    const asm = emitProgram(spec);

    expect(spec.externs).toContain(".mul");
    expect(spec.externs).toContain(".div");
    expect(spec.externs).toContain(".asl");
    expect(spec.externs).toContain(".asr");
    expect(asm).toContain("\tcall\t.mul");
    expect((asm.match(/\tcall\t\.div/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toContain("\tcall\t.asl");
    expect(asm).toContain("\tcall\t.asr");
  });

  test("lowers local char array addresses and constant index reads from the stack frame", () => {
    const source = "int main(){ char buf[16]; outchar(buf); return buf[2]; }\n";
    const parsed = parseProgram(source, "array.c");
    const bound = analyzeProgram(parsed, source, "array.c");
    const spec = lowerSourceProgram(bound, "array.i", source, "array.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#0");
    expect(asm).toContain("\tadd\thl,sp");
    expect(asm).toContain("\tld\thl,#2");
    expect(asm).toContain("\tld\tl,(hl)");
  });

  test("lowers local char array constant index assignments into byte stores", () => {
    const source = "int main(){ char buf[4]; buf[2] = 65; return buf[2]; }\n";
    const parsed = parseProgram(source, "array-assign.c");
    const bound = analyzeProgram(parsed, source, "array-assign.c");
    const spec = lowerSourceProgram(bound, "array-assign.i", source, "array-assign.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#2");
    expect(asm).toContain("\tld\t(hl),#65");
    expect(asm).toContain("\tld\tl,(hl)");
  });

  test("lowers local char array dynamic index reads and assignments through indexed stack addressing", () => {
    const source = "int main(){ int i = 1; char buf[4]; buf[i + 1] = 65; return buf[i]; }\n";
    const parsed = parseProgram(source, "array-dynamic.c");
    const bound = analyzeProgram(parsed, source, "array-dynamic.c");
    const spec = lowerSourceProgram(bound, "array-dynamic.i", source, "array-dynamic.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tadd\thl,de");
    expect(asm).toContain("\tld\t(hl),e");
    expect(asm).toContain("\tld\tl,(hl)");
  });

  test("lowers switch statements into compare dispatch and break labels", () => {
    const source = "int main(int x){ switch (x) { case 65: outchar(65); break; case 66: outchar(66); default: outchar(67); } return 0; }\n";
    const parsed = parseProgram(source, "switch.c");
    const bound = analyzeProgram(parsed, source, "switch.c");
    const spec = lowerSourceProgram(bound, "switch.i", source, "switch.c");
    const asm = emitProgram(spec);

    expect(spec.externs).toContain(".eq");
    expect(asm).toContain("\tcall\t.eq");
    expect((asm.match(/\tjp\t\.\d+/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("lowers do-while loops into post-test back-edge control flow", () => {
    const source = "int main(){ int x = 65; do { outchar(x); x = x + 1; } while (x < 67); return 0; }\n";
    const parsed = parseProgram(source, "do-while.c");
    const bound = analyzeProgram(parsed, source, "do-while.c");
    const spec = lowerSourceProgram(bound, "do-while.i", source, "do-while.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tcall\t.lt");
    expect((asm.match(/\tjp\t\.\d+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tadd\thl,de");
  });
});

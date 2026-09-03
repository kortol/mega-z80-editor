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

    expect(spec.exports).toEqual(["flag", "main"]);
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
    expect(asm).toMatch(/\tjp\t\.[A-Za-z0-9_]+/);
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

    expect(asm).toMatch(/\tjp\tz,\.[A-Za-z0-9_]+/);
    expect(asm).toMatch(/\tjp\tnz,\.[A-Za-z0-9_]+/);
    expect(asm).toContain("\tld\thl,#1");
  });

  test("lowers ternary conditional expressions with branch labels", () => {
    const source = "int main(int a, int b, int c){ return a ? b : c; }\n";
    const parsed = parseProgram(source, "conditional.c");
    const bound = analyzeProgram(parsed, source, "conditional.c");
    const spec = lowerSourceProgram(bound, "conditional.i", source, "conditional.c");
    const asm = emitProgram(spec);

    expect(asm).toMatch(/\tjp\tz,\.[A-Za-z0-9_]+/);
    expect(asm).toMatch(/\tjp\t\.[A-Za-z0-9_]+/);
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
    expect(asm).toMatch(/\tjp\tz,\.[A-Za-z0-9_]+/);
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
    expect(asm).toMatch(/\tjp\tz,\.[A-Za-z0-9_]+/);
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

  test("lowers aggregate pointer-pointer declarations, assignment, compare, and truthiness", () => {
    const source = "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ struct Foo x; union Bar y; struct Foo *p = &x; union Bar *q = &y; struct Foo **pp = &p; union Bar **qq = &q; if (pp) return (pp != 0) + (qq != 0); return 0; }\n";
    const parsed = parseProgram(source, "aggregate-pointer-pointer.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer-pointer.c");
    const spec = lowerSourceProgram(bound, "aggregate-pointer-pointer.i", source, "aggregate-pointer-pointer.c");
    const asm = emitProgram(spec);

    expect(spec.externs).toContain(".ne");
    expect((asm.match(/\tadd\thl,sp/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tcall\t.ne/g) ?? []).length).toBeGreaterThanOrEqual(2);
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
    expect(asm).toMatch(/\tjp\tz,\.[A-Za-z0-9_]+/);
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
    expect(asm).toMatch(/\tjp\tz,\.[A-Za-z0-9_]+/);
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
    expect(asm).toMatch(/\tjp\tz,\.[A-Za-z0-9_]+/);
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
    expect(asm).toMatch(/\tjp\tz,\.[A-Za-z0-9_]+/);
  });

  test("lowers direct aggregate address compares and truthiness", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ struct Foo x; if (&x) return &x != 0; return 0; }\n";
    const parsed = parseProgram(source, "aggregate-address-direct.c");
    const bound = analyzeProgram(parsed, source, "aggregate-address-direct.c");
    const spec = lowerSourceProgram(bound, "aggregate-address-direct.i", source, "aggregate-address-direct.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tadd\thl,sp");
    expect(asm).toContain("\tcall\t.ne");
    expect(asm).toMatch(/\tjp\tz,\.[A-Za-z0-9_]+/);
  });

  test("lowers direct union address compares and truthiness", () => {
    const source = "union Bar { char a; int b; };\nint main(){ union Bar x; if (&x) return &x != 0; return 0; }\n";
    const parsed = parseProgram(source, "union-address-direct.c");
    const bound = analyzeProgram(parsed, source, "union-address-direct.c");
    const spec = lowerSourceProgram(bound, "union-address-direct.i", source, "union-address-direct.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tadd\thl,sp");
    expect(asm).toContain("\tcall\t.ne");
    expect(asm).toMatch(/\tjp\tz,\.[A-Za-z0-9_]+/);
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
    expect(asm).toMatch(/\tjp\tz,\.[A-Za-z0-9_]+/);
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

  test("lowers local aggregate assignment statements", () => {
    const source = "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ struct Foo x; struct Foo y; union Bar u; union Bar v; x = y; u = v; return 0; }\n";
    const parsed = parseProgram(source, "aggregate-assign-value.c");
    const bound = analyzeProgram(parsed, source, "aggregate-assign-value.c");
    const spec = lowerSourceProgram(bound, "aggregate-assign-value.i", source, "aggregate-assign-value.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tadd\thl,sp/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  test("lowers file-scope aggregate assignment statements", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nunion Bar { char a; int b; };\nunion Bar u;\nstruct Foo makeFoo(){ struct Foo x; return x; }\nunion Bar makeBar(){ union Bar x; return x; }\nint main(){ g = makeFoo(); u = makeBar(); return 0; }\n";
    const parsed = parseProgram(source, "aggregate-assign-global-value.c");
    const bound = analyzeProgram(parsed, source, "aggregate-assign-global-value.c");
    const spec = lowerSourceProgram(bound, "aggregate-assign-global-value.i", source, "aggregate-assign-global-value.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmakeFoo/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tmakeBar/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#g\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#u\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test("lowers conditional and comma aggregate assignment expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(int c){ int side = 1; struct Foo x; struct Foo y; struct Foo z; x = c ? y : z; x = (side = 2, y); return x.a + x.b + side; }\n";
    const parsed = parseProgram(source, "aggregate-assign-expr.c");
    const bound = analyzeProgram(parsed, source, "aggregate-assign-expr.c");
    const spec = lowerSourceProgram(bound, "aggregate-assign-expr.i", source, "aggregate-assign-expr.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(asm).toContain("\tld\thl,#2\n\tpush\thl");
  });

  test("lowers member reads from conditional and comma aggregate values", () => {
    const source = "struct Foo { char a; int b; };\nint main(int c){ int side = 0; struct Foo x; struct Foo y; return (c ? x : y).a + ((side = 1), y).b; }\n";
    const parsed = parseProgram(source, "aggregate-value-member-read.c");
    const bound = analyzeProgram(parsed, source, "aggregate-value-member-read.c");
    const spec = lowerSourceProgram(bound, "aggregate-value-member-read.i", source, "aggregate-value-member-read.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\tl,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
  });

  test("lowers file-scope member reads from conditional and comma aggregate values", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo alt;\nint main(int c){ int side = 0; return (c ? g : alt).a + ((side = 1), g).b; }\n";
    const parsed = parseProgram(source, "aggregate-global-value-member-read.c");
    const bound = analyzeProgram(parsed, source, "aggregate-global-value-member-read.c");
    const spec = lowerSourceProgram(bound, "aggregate-global-value-member-read.i", source, "aggregate-global-value-member-read.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#g\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#alt\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
  });

  test("lowers file-scope address-of on fields from conditional and comma aggregate values", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo alt;\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(int c){ int side = 0; return first(&(c ? g : alt).a) + second(&((side = 1), g).b); }\n";
    const parsed = parseProgram(source, "aggregate-global-value-field-address.c");
    const bound = analyzeProgram(parsed, source, "aggregate-global-value-field-address.c");
    const spec = lowerSourceProgram(bound, "aggregate-global-value-field-address.i", source, "aggregate-global-value-field-address.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tfirst/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tsecond/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#g\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#alt\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
  });

  test("lowers address-of on fields from conditional, comma, and assign-expression aggregate values", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(int c){ int side = 0; struct Foo x; struct Foo y; return first(&(c ? x : y).a) + second(&((side = 1), y).b) + first(&((x = make()).a)); }\n";
    const parsed = parseProgram(source, "aggregate-value-field-address.c");
    const bound = analyzeProgram(parsed, source, "aggregate-value-field-address.c");
    const spec = lowerSourceProgram(bound, "aggregate-value-field-address.i", source, "aggregate-value-field-address.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tfirst/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\tsecond/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tadd\thl,sp/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("lowers aggregate call arguments via temporary address passing", () => {
    const source = "struct Foo { char a; int b; };\nint take(struct Foo a){ return a.a + a.b; }\nint main(){ struct Foo x; return take(x); }\n";
    const parsed = parseProgram(source, "aggregate-call-value.c");
    const bound = analyzeProgram(parsed, source, "aggregate-call-value.c");
    const spec = lowerSourceProgram(bound, "aggregate-call-value.i", source, "aggregate-call-value.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tadd\thl,sp/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tpush\thl/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("lowers file-scope aggregate call arguments via temporary address passing", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nint take(struct Foo a){ return a.a + a.b; }\nint main(){ return take(g); }\n";
    const parsed = parseProgram(source, "aggregate-call-global-value.c");
    const bound = analyzeProgram(parsed, source, "aggregate-call-global-value.c");
    const spec = lowerSourceProgram(bound, "aggregate-call-global-value.i", source, "aggregate-call-global-value.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("g:\t.ds\t3");
    expect(asm).toContain("\tld\thl,#g+0");
  });

  test("lowers file-scope union call arguments via temporary address passing", () => {
    const source = "union Bar { char a; int b; };\nunion Bar g;\nint take(union Bar a){ return a.a; }\nint main(){ return take(g); }\n";
    const parsed = parseProgram(source, "union-call-global-value.c");
    const bound = analyzeProgram(parsed, source, "union-call-global-value.c");
    const spec = lowerSourceProgram(bound, "union-call-global-value.i", source, "union-call-global-value.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("g:\t.ds\t2");
    expect(asm).toContain("\tld\thl,#g+0");
  });

  test("lowers aggregate return statements and aggregate-returning value paths", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nint main(){ struct Foo y; y = make(); return make().a; }\n";
    const parsed = parseProgram(source, "aggregate-return-value.c");
    const bound = analyzeProgram(parsed, source, "aggregate-return-value.c");
    const spec = lowerSourceProgram(bound, "aggregate-return-value.i", source, "aggregate-return-value.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tpush\thl/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("lowers file-scope aggregate return statements", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo pick(){ return g; }\nint main(){ return pick().a; }\n";
    const parsed = parseProgram(source, "aggregate-return-global-value.c");
    const bound = analyzeProgram(parsed, source, "aggregate-return-global-value.c");
    const spec = lowerSourceProgram(bound, "aggregate-return-global-value.i", source, "aggregate-return-global-value.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tpick/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("g:\t.ds\t3");
    expect(asm).toContain("\tld\thl,#g+0");
  });

  test("lowers file-scope union return statements", () => {
    const source = "union Bar { char a; int b; };\nunion Bar g;\nunion Bar pick(){ return g; }\nint main(){ return pick().a; }\n";
    const parsed = parseProgram(source, "union-return-global-value.c");
    const bound = analyzeProgram(parsed, source, "union-return-global-value.c");
    const spec = lowerSourceProgram(bound, "union-return-global-value.i", source, "union-return-global-value.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tpick/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("g:\t.ds\t2");
    expect(asm).toContain("\tld\thl,#g+0");
  });

  test("lowers aggregate declaration initializers and nested aggregate-returning calls", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nstruct Foo id(struct Foo x){ return x; }\nint take(struct Foo x){ return x.b; }\nint main(){ struct Foo y = make(); return take(make()) + id(make()).a + y.b; }\n";
    const parsed = parseProgram(source, "aggregate-return-nested.c");
    const bound = analyzeProgram(parsed, source, "aggregate-return-nested.c");
    const spec = lowerSourceProgram(bound, "aggregate-return-nested.i", source, "aggregate-return-nested.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((asm.match(/\tcall\tid/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tpush\thl/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test("lowers conditional and comma aggregate-returning call value paths", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nstruct Foo id(struct Foo x){ return x; }\nint take(struct Foo x){ return x.a; }\nint main(int c){ int side = 0; struct Foo y = c ? make() : id(make()); return take(c ? make() : y) + ((side = 1), make()).b + side; }\n";
    const parsed = parseProgram(source, "aggregate-return-conditional-comma.c");
    const bound = analyzeProgram(parsed, source, "aggregate-return-conditional-comma.c");
    const spec = lowerSourceProgram(bound, "aggregate-return-conditional-comma.i", source, "aggregate-return-conditional-comma.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((asm.match(/\tcall\tid/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toMatch(/\tjp\tz,\.[A-Za-z0-9_]+/);
  });

  test("lowers file-scope aggregate declaration initializers from aggregate values", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo alt;\nstruct Foo makeA(){ struct Foo x; return x; }\nstruct Foo makeB(){ struct Foo x; return x; }\nstruct Foo id(struct Foo x){ return x; }\nint main(int c){ int side = 0; struct Foo y = g; struct Foo z = c ? g : alt; struct Foo w = id(g = makeA()); struct Foo q = id(((side = 1), (g = makeB()))); return y.a + z.b + w.a + q.b; }\n";
    const parsed = parseProgram(source, "aggregate-global-init-values.c");
    const bound = analyzeProgram(parsed, source, "aggregate-global-init-values.c");
    const spec = lowerSourceProgram(bound, "aggregate-global-init-values.i", source, "aggregate-global-init-values.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmakeA/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tmakeB/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tid/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\thl,#g\+0/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tld\thl,#alt\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
  });

  test("lowers file-scope union declaration initializers from aggregate values", () => {
    const source = "union Bar { char a; int b; };\nunion Bar u;\nunion Bar alt;\nunion Bar makeA(){ union Bar x; return x; }\nunion Bar makeB(){ union Bar x; return x; }\nunion Bar id(union Bar x){ return x; }\nint main(int c){ int side = 0; union Bar y = u; union Bar z = c ? u : alt; union Bar w = id(u = makeA()); union Bar q = id(((side = 1), (u = makeB()))); return y.a + z.a + w.a + q.a; }\n";
    const parsed = parseProgram(source, "union-global-init-values.c");
    const bound = analyzeProgram(parsed, source, "union-global-init-values.c");
    const spec = lowerSourceProgram(bound, "union-global-init-values.i", source, "union-global-init-values.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmakeA/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tmakeB/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tid/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\thl,#u\+0/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tld\thl,#alt\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
  });

  test("lowers aggregate return pass-through for conditional, comma, and assign-expression values", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo makeA(){ struct Foo x; return x; }\nstruct Foo makeB(){ struct Foo x; return x; }\nstruct Foo pick(int c){ struct Foo x = makeA(); struct Foo y = makeB(); return c ? x : y; }\nstruct Foo passthroughComma(){ int side = 0; struct Foo y = makeA(); return ((side = 1), y); }\nstruct Foo passthroughAssign(){ struct Foo z; return (z = makeB()); }\nint main(){ struct Foo x = pick(0); struct Foo y = passthroughComma(); struct Foo z = passthroughAssign(); return x.a + y.a + z.a; }\n";
    const parsed = parseProgram(source, "aggregate-return-pass-through.c");
    const bound = analyzeProgram(parsed, source, "aggregate-return-pass-through.c");
    const spec = lowerSourceProgram(bound, "aggregate-return-pass-through.i", source, "aggregate-return-pass-through.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tpick/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tpassthroughComma/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tpassthroughAssign/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tmakeA/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\tmakeB/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("lowers file-scope aggregate return pass-through for conditional and comma values", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo alt;\nstruct Foo pick(int c){ return c ? g : alt; }\nstruct Foo passComma(){ int side = 0; return ((side = 1), g); }\nint main(){ return pick(1).a + passComma().b; }\n";
    const parsed = parseProgram(source, "aggregate-global-return-pass-through.c");
    const bound = analyzeProgram(parsed, source, "aggregate-global-return-pass-through.c");
    const spec = lowerSourceProgram(bound, "aggregate-global-return-pass-through.i", source, "aggregate-global-return-pass-through.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tpick/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tpassComma/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#g\+0/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\thl,#alt\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("lowers branch-local aggregate declaration initializers", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nint main(int c){ if (c) { struct Foo y = make(); return y.a; } else { struct Foo z = make(); return z.b; } }\n";
    const parsed = parseProgram(source, "aggregate-branch-local-init.c");
    const bound = analyzeProgram(parsed, source, "aggregate-branch-local-init.c");
    const spec = lowerSourceProgram(bound, "aggregate-branch-local-init.i", source, "aggregate-branch-local-init.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tjp\t\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("lowers aggregate assignment expression results", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nint take(struct Foo x){ return x.b; }\nint main(){ struct Foo x; return (x = make()).a + take(x = make()); }\n";
    const parsed = parseProgram(source, "aggregate-assign-expr-result.c");
    const bound = analyzeProgram(parsed, source, "aggregate-assign-expr-result.c");
    const spec = lowerSourceProgram(bound, "aggregate-assign-expr-result.i", source, "aggregate-assign-expr-result.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("lowers aggregate assignment expression results for address destinations without re-evaluating the destination", () => {
    const source = "struct Item { char value; };\nstruct Holder { struct Item item; };\nstruct Item make(char value){ struct Item x; x.value = value; return x; }\nint take(struct Item x){ return x.value; }\nint main(){ struct Holder holder; struct Item items[2]; struct Item *p = &items[1]; return (holder.item = make(65)).value + take(items[0] = make(66)) + ((*p = make(67)).value); }\n";
    const parsed = parseProgram(source, "aggregate-assign-expr-address-result.c");
    const bound = analyzeProgram(parsed, source, "aggregate-assign-expr-address-result.c");
    const spec = lowerSourceProgram(bound, "aggregate-assign-expr-address-result.i", source, "aggregate-assign-expr-address-result.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  test("lowers file-scope aggregate assignment expression results", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo make(){ struct Foo x; return x; }\nint take(struct Foo x){ return x.b; }\nint main(){ return (g = make()).a + take(g = make()); }\n";
    const parsed = parseProgram(source, "aggregate-global-assign-expr-result.c");
    const bound = analyzeProgram(parsed, source, "aggregate-global-assign-expr-result.c");
    const spec = lowerSourceProgram(bound, "aggregate-global-assign-expr-result.i", source, "aggregate-global-assign-expr-result.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#g\+0/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test("lowers file-scope union assignment expression results", () => {
    const source = "union Bar { char a; int b; };\nunion Bar u;\nunion Bar make(){ union Bar x; return x; }\nint take(union Bar x){ return x.a; }\nint main(){ return (u = make()).a + take(u = make()); }\n";
    const parsed = parseProgram(source, "union-global-assign-expr-result.c");
    const bound = analyzeProgram(parsed, source, "union-global-assign-expr-result.c");
    const spec = lowerSourceProgram(bound, "union-global-assign-expr-result.i", source, "union-global-assign-expr-result.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#u\+0/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("lowers file-scope aggregate assign-expression return pass-through", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo make(){ struct Foo x; return x; }\nstruct Foo pass(){ return (g = make()); }\nint main(){ return pass().a; }\n";
    const parsed = parseProgram(source, "aggregate-global-assign-return-pass-through.c");
    const bound = analyzeProgram(parsed, source, "aggregate-global-assign-return-pass-through.c");
    const spec = lowerSourceProgram(bound, "aggregate-global-assign-return-pass-through.i", source, "aggregate-global-assign-return-pass-through.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tpass/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#g\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("lowers file-scope union assign-expression return pass-through", () => {
    const source = "union Bar { char a; int b; };\nunion Bar u;\nunion Bar make(){ union Bar x; return x; }\nunion Bar pass(){ return (u = make()); }\nint main(){ return pass().a; }\n";
    const parsed = parseProgram(source, "union-global-assign-return-pass-through.c");
    const bound = analyzeProgram(parsed, source, "union-global-assign-return-pass-through.c");
    const spec = lowerSourceProgram(bound, "union-global-assign-return-pass-through.i", source, "union-global-assign-return-pass-through.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tpass/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#u\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers file-scope address-of on fields from assign-expression aggregate values", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo make(){ struct Foo x; return x; }\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(){ return first(&((g = make()).a)) + second(&((g = make()).b)); }\n";
    const parsed = parseProgram(source, "aggregate-global-assign-field-address.c");
    const bound = analyzeProgram(parsed, source, "aggregate-global-assign-field-address.c");
    const spec = lowerSourceProgram(bound, "aggregate-global-assign-field-address.i", source, "aggregate-global-assign-field-address.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\tfirst/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tsecond/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#g\+0/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("does not add an extra stack temp for assign-expression field consumers", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo make(){ struct Foo x; return x; }\nint main(){ return (g = make()).a; }\n";
    const parsed = parseProgram(source, "aggregate-global-assign-field-read-no-extra-temp.c");
    const bound = analyzeProgram(parsed, source, "aggregate-global-assign-field-read-no-extra-temp.c");
    const spec = lowerSourceProgram(bound, "aggregate-global-assign-field-read-no-extra-temp.i", source, "aggregate-global-assign-field-read-no-extra-temp.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect((mainBody.match(/\tdec\tsp/g) ?? []).length).toBe(3);
    expect(mainBody).not.toContain("\tld\thl,#3\n\tadd\thl,sp");
  });

  test("uses only the ABI return slot temp for aggregate call field consumers", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nint main(){ return make().a; }\n";
    const parsed = parseProgram(source, "aggregate-call-field-read-no-extra-temp.c");
    const bound = analyzeProgram(parsed, source, "aggregate-call-field-read-no-extra-temp.c");
    const spec = lowerSourceProgram(bound, "aggregate-call-field-read-no-extra-temp.i", source, "aggregate-call-field-read-no-extra-temp.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect((mainBody.match(/\tdec\tsp/g) ?? []).length).toBe(3);
    expect(mainBody).not.toContain("\tld\thl,#3\n\tadd\thl,sp");
  });

  test("uses only the ABI return slot temp for aggregate call field address consumers", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nchar first(char *p){ return p[0]; }\nint main(){ return first(&(make().a)); }\n";
    const parsed = parseProgram(source, "aggregate-call-field-address-no-extra-temp.c");
    const bound = analyzeProgram(parsed, source, "aggregate-call-field-address-no-extra-temp.c");
    const spec = lowerSourceProgram(bound, "aggregate-call-field-address-no-extra-temp.i", source, "aggregate-call-field-address-no-extra-temp.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect((mainBody.match(/\tdec\tsp/g) ?? []).length).toBe(3);
    expect(mainBody).not.toContain("\tld\thl,#3\n\tadd\thl,sp");
  });

  test("uses only one ABI return slot for conditional aggregate call field consumers", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo makeA(){ struct Foo x; return x; }\nstruct Foo makeB(){ struct Foo x; return x; }\nint main(int c){ return (c ? makeA() : makeB()).a; }\n";
    const parsed = parseProgram(source, "aggregate-conditional-call-field-read-no-extra-temp.c");
    const bound = analyzeProgram(parsed, source, "aggregate-conditional-call-field-read-no-extra-temp.c");
    const spec = lowerSourceProgram(bound, "aggregate-conditional-call-field-read-no-extra-temp.i", source, "aggregate-conditional-call-field-read-no-extra-temp.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect((mainBody.match(/\tdec\tsp/g) ?? []).length).toBe(3);
    expect(mainBody).not.toContain("\tld\thl,#3\n\tadd\thl,sp");
  });

  test("uses only the ABI return slot temp for aggregate call arguments", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nint take(struct Foo x){ return x.a; }\nint main(){ return take(make()); }\n";
    const parsed = parseProgram(source, "aggregate-call-arg-no-extra-temp.c");
    const bound = analyzeProgram(parsed, source, "aggregate-call-arg-no-extra-temp.c");
    const spec = lowerSourceProgram(bound, "aggregate-call-arg-no-extra-temp.i", source, "aggregate-call-arg-no-extra-temp.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect((mainBody.match(/\tdec\tsp/g) ?? []).length).toBe(3);
    expect(mainBody).not.toContain("\tld\thl,#3\n\tadd\thl,sp");
  });

  test("uses one ABI return slot per nested aggregate call producer", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nstruct Foo id(struct Foo x){ return x; }\nint main(){ return id(make()).a; }\n";
    const parsed = parseProgram(source, "aggregate-nested-call-field-read-abi-slots.c");
    const bound = analyzeProgram(parsed, source, "aggregate-nested-call-field-read-abi-slots.c");
    const spec = lowerSourceProgram(bound, "aggregate-nested-call-field-read-abi-slots.i", source, "aggregate-nested-call-field-read-abi-slots.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect((mainBody.match(/\tdec\tsp/g) ?? []).length).toBe(6);
    expect((mainBody.match(/\tld\thl,#3\n\tadd\thl,sp/g) ?? []).length).toBe(2);
  });

  test("uses only the ABI return slot temp for union call field consumers", () => {
    const source = "union Bar { char a; int b; };\nunion Bar make(){ union Bar x; return x; }\nint main(){ return make().a; }\n";
    const parsed = parseProgram(source, "union-call-field-read-no-extra-temp.c");
    const bound = analyzeProgram(parsed, source, "union-call-field-read-no-extra-temp.c");
    const spec = lowerSourceProgram(bound, "union-call-field-read-no-extra-temp.i", source, "union-call-field-read-no-extra-temp.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect((mainBody.match(/\tdec\tsp/g) ?? []).length).toBe(2);
    expect(mainBody).not.toContain("\tld\thl,#2\n\tadd\thl,sp");
  });

  test("uses only the ABI return slot temp for union call field address consumers", () => {
    const source = "union Bar { char a; int b; };\nunion Bar make(){ union Bar x; return x; }\nchar first(char *p){ return p[0]; }\nint main(){ return first(&(make().a)); }\n";
    const parsed = parseProgram(source, "union-call-field-address-no-extra-temp.c");
    const bound = analyzeProgram(parsed, source, "union-call-field-address-no-extra-temp.c");
    const spec = lowerSourceProgram(bound, "union-call-field-address-no-extra-temp.i", source, "union-call-field-address-no-extra-temp.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect((mainBody.match(/\tdec\tsp/g) ?? []).length).toBe(2);
    expect(mainBody).not.toContain("\tld\thl,#2\n\tadd\thl,sp");
  });

  test("uses only the ABI return slot temp for union call arguments", () => {
    const source = "union Bar { char a; int b; };\nunion Bar make(){ union Bar x; return x; }\nint take(union Bar x){ return x.a; }\nint main(){ return take(make()); }\n";
    const parsed = parseProgram(source, "union-call-arg-no-extra-temp.c");
    const bound = analyzeProgram(parsed, source, "union-call-arg-no-extra-temp.c");
    const spec = lowerSourceProgram(bound, "union-call-arg-no-extra-temp.i", source, "union-call-arg-no-extra-temp.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect((mainBody.match(/\tdec\tsp/g) ?? []).length).toBe(2);
    expect(mainBody).not.toContain("\tld\thl,#2\n\tadd\thl,sp");
  });

  test("writes aggregate call results directly into file-scope destinations", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo make(){ struct Foo x; return x; }\nint main(){ g = make(); return g.a; }\n";
    const spec = lowerSourceProgram(analyzeProgram(parseProgram(source, "aggregate-call-global-destination.c"), source, "aggregate-call-global-destination.c"), "aggregate_call_global_destination", source, "aggregate-call-global-destination.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect(mainBody).toContain("\tld\thl,#g");
    expect(mainBody).toContain("\tcall\tmake");
    expect(mainBody).not.toContain("\tdec\tsp");
  });

  test("writes aggregate call results directly into aggregate field destinations", () => {
    const source = "struct Pair { char first; char second; };\nstruct Holder { struct Pair value; };\nstruct Pair make(){ struct Pair result = {65, 66}; return result; }\nint main(){ struct Holder holder; holder.value = make(); return holder.value.first; }\n";
    const spec = lowerSourceProgram(analyzeProgram(parseProgram(source, "aggregate-call-field-destination.c"), source, "aggregate-call-field-destination.c"), "aggregate_call_field_destination", source, "aggregate-call-field-destination.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect(mainBody).toContain("\tcall\tmake");
    // The holder consumes two bytes; no extra aggregate result temporary is allocated.
    expect((mainBody.match(/\tdec\tsp/g) ?? []).length).toBe(2);
  });

  test("uses one ABI return slot per nested aggregate call field address producer", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nstruct Foo id(struct Foo x){ return x; }\nchar first(char *p){ return p[0]; }\nint main(){ return first(&(id(make()).a)); }\n";
    const parsed = parseProgram(source, "aggregate-nested-call-field-address-abi-slots.c");
    const bound = analyzeProgram(parsed, source, "aggregate-nested-call-field-address-abi-slots.c");
    const spec = lowerSourceProgram(bound, "aggregate-nested-call-field-address-abi-slots.i", source, "aggregate-nested-call-field-address-abi-slots.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect((mainBody.match(/\tdec\tsp/g) ?? []).length).toBe(6);
    expect((mainBody.match(/\tld\thl,#3\n\tadd\thl,sp/g) ?? []).length).toBe(2);
    expect((mainBody.match(/\tld\thl,#2\n\tadd\thl,sp/g) ?? []).length).toBe(2);
  });

  test("uses one shared ABI return slot for conditional nested aggregate call field consumers", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo makeA(){ struct Foo x; return x; }\nstruct Foo makeB(){ struct Foo x; return x; }\nstruct Foo id(struct Foo x){ return x; }\nint main(int c){ return (c ? id(makeA()) : id(makeB())).a; }\n";
    const parsed = parseProgram(source, "aggregate-conditional-nested-call-field-read-abi-slots.c");
    const bound = analyzeProgram(parsed, source, "aggregate-conditional-nested-call-field-read-abi-slots.c");
    const spec = lowerSourceProgram(bound, "aggregate-conditional-nested-call-field-read-abi-slots.i", source, "aggregate-conditional-nested-call-field-read-abi-slots.c");
    const asm = emitProgram(spec);
    const mainBody = asm.match(/\nmain:\n([\s\S]*?)\n\tret/)?.[1] ?? "";

    expect((mainBody.match(/\tdec\tsp/g) ?? []).length).toBe(9);
    expect((mainBody.match(/\tld\thl,#6\n\tadd\thl,sp/g) ?? []).length).toBe(4);
    expect((mainBody.match(/\tld\thl,#5\n\tadd\thl,sp/g) ?? []).length).toBe(2);
    expect((mainBody.match(/\tld\thl,#2\n\tadd\thl,sp/g) ?? []).length).toBe(2);
  });

  test("lowers file-scope conditional and comma aggregate assign-expression values", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo makeA(){ struct Foo x; return x; }\nstruct Foo makeB(){ struct Foo x; return x; }\nint main(int c){ int side = 0; return (c ? (g = makeA()) : (g = makeB())).a + (((side = 1), (g = makeA()))).b; }\n";
    const parsed = parseProgram(source, "aggregate-global-assign-conditional-comma.c");
    const bound = analyzeProgram(parsed, source, "aggregate-global-assign-conditional-comma.c");
    const spec = lowerSourceProgram(bound, "aggregate-global-assign-conditional-comma.i", source, "aggregate-global-assign-conditional-comma.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmakeA/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\tmakeB/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#g\+0/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
  });

  test("lowers file-scope address-of on fields from union assign-expression aggregate values", () => {
    const source = "union Bar { char a; int b; };\nunion Bar u;\nunion Bar make(){ union Bar x; return x; }\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(){ return first(&((u = make()).a)) + second(&((u = make()).b)); }\n";
    const parsed = parseProgram(source, "union-global-assign-field-address.c");
    const bound = analyzeProgram(parsed, source, "union-global-assign-field-address.c");
    const spec = lowerSourceProgram(bound, "union-global-assign-field-address.i", source, "union-global-assign-field-address.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\tfirst/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tsecond/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#u\+0/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers file-scope conditional and comma union assign-expression values", () => {
    const source = "union Bar { char a; int b; };\nunion Bar u;\nunion Bar makeA(){ union Bar x; return x; }\nunion Bar makeB(){ union Bar x; return x; }\nint main(int c){ int side = 0; return (c ? (u = makeA()) : (u = makeB())).a + (((side = 1), (u = makeA()))).a; }\n";
    const parsed = parseProgram(source, "union-global-assign-conditional-comma.c");
    const bound = analyzeProgram(parsed, source, "union-global-assign-conditional-comma.c");
    const spec = lowerSourceProgram(bound, "union-global-assign-conditional-comma.i", source, "union-global-assign-conditional-comma.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmakeA/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\tmakeB/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#u\+0/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
  });

  test("lowers file-scope aggregate call and return paths from conditional and comma assign-expression values", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo makeA(){ struct Foo x; return x; }\nstruct Foo makeB(){ struct Foo x; return x; }\nint take(struct Foo x){ return x.a; }\nstruct Foo pass_cond(int c){ return c ? (g = makeA()) : (g = makeB()); }\nstruct Foo pass_comma(){ int side = 0; return ((side = 1), (g = makeA())); }\nint main(int c){ int side = 0; return take(c ? (g = makeA()) : (g = makeB())) + take(((side = 1), (g = makeA()))) + pass_cond(c).b + pass_comma().a; }\n";
    const parsed = parseProgram(source, "aggregate-global-assign-call-return-composite.c");
    const bound = analyzeProgram(parsed, source, "aggregate-global-assign-call-return-composite.c");
    const spec = lowerSourceProgram(bound, "aggregate-global-assign-call-return-composite.i", source, "aggregate-global-assign-call-return-composite.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmakeA/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tcall\tmakeB/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\tpass_cond/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tpass_comma/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#g\+0/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
  });

  test("lowers file-scope union call and return paths from conditional and comma assign-expression values", () => {
    const source = "union Bar { char a; int b; };\nunion Bar u;\nunion Bar makeA(){ union Bar x; return x; }\nunion Bar makeB(){ union Bar x; return x; }\nint take(union Bar x){ return x.a; }\nunion Bar pass_cond(int c){ return c ? (u = makeA()) : (u = makeB()); }\nunion Bar pass_comma(){ int side = 0; return ((side = 1), (u = makeA())); }\nint main(int c){ int side = 0; return take(c ? (u = makeA()) : (u = makeB())) + take(((side = 1), (u = makeA()))) + pass_cond(c).a + pass_comma().a; }\n";
    const parsed = parseProgram(source, "union-global-assign-call-return-composite.c");
    const bound = analyzeProgram(parsed, source, "union-global-assign-call-return-composite.c");
    const spec = lowerSourceProgram(bound, "union-global-assign-call-return-composite.i", source, "union-global-assign-call-return-composite.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmakeA/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tcall\tmakeB/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\tpass_cond/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tpass_comma/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#u\+0/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
  });

  test("lowers loop-local aggregate declaration initializers", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nint main(){ int i = 0; while (i == 0) { struct Foo y = make(); i = y.a; } for (; i == 65; i = 66) { struct Foo z = make(); i = z.b; } do { struct Foo w = make(); i = w.a; } while (0); return i; }\n";
    const parsed = parseProgram(source, "aggregate-loop-local-init.c");
    const bound = analyzeProgram(parsed, source, "aggregate-loop-local-init.c");
    const spec = lowerSourceProgram(bound, "aggregate-loop-local-init.i", source, "aggregate-loop-local-init.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((asm.match(/\tcall\t.eq/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers for-loop aggregate declaration initializers from aggregate producers", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo makeA(){ struct Foo x; return x; }\nstruct Foo makeB(){ struct Foo x; return x; }\nint main(){ int c = 1; for (struct Foo x = c ? makeA() : makeB(); c; c = 0) { return x.a; } return 0; }\n";
    const spec = lowerSourceProgram(analyzeProgram(parseProgram(source, "for-aggregate-decl-init.c"), source, "for-aggregate-decl-init.c"), "for_aggregate_decl_init", source, "for-aggregate-decl-init.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tcall\tmakeA");
    expect(asm).toContain("\tcall\tmakeB");
    expect(asm).toContain("\tjp\tz,");
  });

  test("lowers for-loop aggregate declaration brace initializers", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ for (struct Foo x = { 65, 66 }; x.a; x.a = 0) { return x.b; } return 0; }\n";
    const spec = lowerSourceProgram(analyzeProgram(parseProgram(source, "for-aggregate-brace-init.c"), source, "for-aggregate-brace-init.c"), "for_aggregate_brace_init", source, "for-aggregate-brace-init.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#65");
    expect(asm).toContain("\tld\thl,#66");
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("lowers chained aggregate value call paths", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo make(){ struct Foo x; return x; }\nstruct Foo id(struct Foo x){ return x; }\nint take(struct Foo x){ return x.a; }\nint main(int c){ return id(id(make())).a + take(id(make())) + (c ? id(make()) : make()).b; }\n";
    const parsed = parseProgram(source, "aggregate-chained-value-paths.c");
    const bound = analyzeProgram(parsed, source, "aggregate-chained-value-paths.c");
    const spec = lowerSourceProgram(bound, "aggregate-chained-value-paths.i", source, "aggregate-chained-value-paths.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmake/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tcall\tid/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tjp\t\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers file-scope chained aggregate value call paths", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo alt;\nstruct Foo id(struct Foo x){ return x; }\nint take(struct Foo x){ return x.a; }\nstruct Foo pass(int c){ return id(c ? g : alt); }\nint main(int c){ int side = 0; return id(id(g)).a + take(id(c ? g : alt)) + id(((side = 1), g)).b + pass(c).a; }\n";
    const parsed = parseProgram(source, "aggregate-global-chained-value-paths.c");
    const bound = analyzeProgram(parsed, source, "aggregate-global-chained-value-paths.c");
    const spec = lowerSourceProgram(bound, "aggregate-global-chained-value-paths.i", source, "aggregate-global-chained-value-paths.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tid/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tpass/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#g\+0/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((asm.match(/\tld\thl,#alt\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
  });

  test("lowers file-scope union chained aggregate value call paths", () => {
    const source = "union Bar { char a; int b; };\nunion Bar u;\nunion Bar alt;\nunion Bar id(union Bar x){ return x; }\nint take(union Bar x){ return x.a; }\nunion Bar pass(int c){ return id(c ? u : alt); }\nint main(int c){ int side = 0; return id(id(u)).a + take(id(c ? u : alt)) + id(((side = 1), u)).a + pass(c).a; }\n";
    const parsed = parseProgram(source, "union-global-chained-value-paths.c");
    const bound = analyzeProgram(parsed, source, "union-global-chained-value-paths.c");
    const spec = lowerSourceProgram(bound, "union-global-chained-value-paths.i", source, "union-global-chained-value-paths.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tid/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tcall\tpass/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#u\+0/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((asm.match(/\tld\thl,#alt\+0/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
  });

  test("lowers file-scope aggregate assign-expression nested call paths", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nstruct Foo makeA(){ struct Foo x; return x; }\nstruct Foo makeB(){ struct Foo x; return x; }\nstruct Foo id(struct Foo x){ return x; }\nint take(struct Foo x){ return x.a; }\nstruct Foo pass(int c){ return id(c ? (g = makeA()) : (g = makeB())); }\nint main(int c){ int side = 0; return id(g = makeA()).a + take(id(g = makeB())) + id(((side = 1), (g = makeA()))).b + pass(c).a; }\n";
    const parsed = parseProgram(source, "aggregate-global-assign-nested-call-paths.c");
    const bound = analyzeProgram(parsed, source, "aggregate-global-assign-nested-call-paths.c");
    const spec = lowerSourceProgram(bound, "aggregate-global-assign-nested-call-paths.i", source, "aggregate-global-assign-nested-call-paths.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmakeA/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((asm.match(/\tcall\tmakeB/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\tid/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#g\+0/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
  });

  test("lowers file-scope union assign-expression nested call paths", () => {
    const source = "union Bar { char a; int b; };\nunion Bar u;\nunion Bar makeA(){ union Bar x; return x; }\nunion Bar makeB(){ union Bar x; return x; }\nunion Bar id(union Bar x){ return x; }\nint take(union Bar x){ return x.a; }\nunion Bar pass(int c){ return id(c ? (u = makeA()) : (u = makeB())); }\nint main(int c){ int side = 0; return id(u = makeA()).a + take(id(u = makeB())) + id(((side = 1), (u = makeA()))).a + pass(c).a; }\n";
    const parsed = parseProgram(source, "union-global-assign-nested-call-paths.c");
    const bound = analyzeProgram(parsed, source, "union-global-assign-nested-call-paths.c");
    const spec = lowerSourceProgram(bound, "union-global-assign-nested-call-paths.i", source, "union-global-assign-nested-call-paths.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tcall\tmakeA/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((asm.match(/\tcall\tmakeB/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tcall\tid/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tcall\ttake/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((asm.match(/\tld\thl,#u\+0/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((asm.match(/\tjp\tz,\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tld\thl,#1\n\tpush\thl");
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
    expect((asm.match(/\tjp\t\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(2);
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

    expect((asm.match(/\tjp\t\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(2);
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
    expect((asm.match(/\tjp\t\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(2);
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

  test("lowers char array string literal initializers into byte stores", () => {
    const source = "int main(){ char buf[] = \"AB\"; return buf[1]; }\n";
    const parsed = parseProgram(source, "array-string-init.c");
    const bound = analyzeProgram(parsed, source, "array-string-init.c");
    const spec = lowerSourceProgram(bound, "array-string-init.i", source, "array-string-init.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\t(hl),#65");
    expect(asm).toContain("\tld\t(hl),#66");
    expect(asm).toContain("\tld\t(hl),#0");
    expect(asm).toContain("\tld\thl,#1");
    expect(asm).toContain("\tld\tl,(hl)");
  });

  test("lowers exact-fit char array string literal initializers without trailing zero fill", () => {
    const source = "int main(){ char buf[2] = \"AB\"; return buf[1]; }\n";
    const parsed = parseProgram(source, "array-string-init-exact-fit.c");
    const bound = analyzeProgram(parsed, source, "array-string-init-exact-fit.c");
    const spec = lowerSourceProgram(bound, "array-string-init-exact-fit.i", source, "array-string-init-exact-fit.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\t(hl),#65");
    expect(asm).toContain("\tld\t(hl),#66");
    expect(asm).not.toContain("\tld\t(hl),#0");
  });

  test("lowers for-loop char array string literal declaration initializers", () => {
    const source = "int main(){ for (char buf[] = \"AB\"; buf[0]; buf[0] = 0) { return buf[1]; } return 0; }\n";
    const parsed = parseProgram(source, "for-array-string-init.c");
    const bound = analyzeProgram(parsed, source, "for-array-string-init.c");
    const spec = lowerSourceProgram(bound, "for-array-string-init.i", source, "for-array-string-init.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\t(hl),#65");
    expect(asm).toContain("\tld\t(hl),#66");
    expect(asm).toContain("\tld\t(hl),#0");
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
    expect((asm.match(/\tjp\t\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("lowers do-while loops into post-test back-edge control flow", () => {
    const source = "int main(){ int x = 65; do { outchar(x); x = x + 1; } while (x < 67); return 0; }\n";
    const parsed = parseProgram(source, "do-while.c");
    const bound = analyzeProgram(parsed, source, "do-while.c");
    const spec = lowerSourceProgram(bound, "do-while.i", source, "do-while.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tcall\t.lt");
    expect((asm.match(/\tjp\t\.[A-Za-z0-9_]+/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(asm).toContain("\tadd\thl,de");
  });

  test("lowers file-scope aggregate field reads and writes", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nint main(){ g.a = 65; g.b = 66; return g.a + g.b; }\n";
    const parsed = parseProgram(source, "global-aggregate-fields.c");
    const bound = analyzeProgram(parsed, source, "global-aggregate-fields.c");
    const spec = lowerSourceProgram(bound, "global-aggregate-fields.i", source, "global-aggregate-fields.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("g:");
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("lowers nested file-scope aggregate field reads and writes", () => {
    const source = "struct Inner { char a; int b; };\nstruct Outer { struct Inner inner; char tail; };\nstruct Outer g;\nint main(){ g.inner.a = 65; g.inner.b = 66; g.tail = 67; return g.inner.a + g.inner.b + g.tail; }\n";
    const parsed = parseProgram(source, "global-nested-aggregate-fields.c");
    const bound = analyzeProgram(parsed, source, "global-nested-aggregate-fields.c");
    const spec = lowerSourceProgram(bound, "global-nested-aggregate-fields.i", source, "global-nested-aggregate-fields.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("g:");
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("lowers file-scope aggregate brace initializers", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g = { 65, 66 };\nint main(){ return g.a + g.b; }\n";
    const parsed = parseProgram(source, "global-aggregate-init.c");
    const bound = analyzeProgram(parsed, source, "global-aggregate-init.c");
    const spec = lowerSourceProgram(bound, "global-aggregate-init.i", source, "global-aggregate-init.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("g:");
    expect(asm).toContain("g:\t.db\t65");
    expect(asm).toContain("\t.dw\t66");
  });

  test("lowers nested file-scope aggregate brace initializers", () => {
    const source = "struct Inner { char a; int b; };\nstruct Outer { struct Inner inner; char tail; };\nstruct Outer g = { { 65, 66 }, 67 };\nint main(){ return g.inner.a + g.inner.b + g.tail; }\n";
    const parsed = parseProgram(source, "global-nested-aggregate-init.c");
    const bound = analyzeProgram(parsed, source, "global-nested-aggregate-init.c");
    const spec = lowerSourceProgram(bound, "global-nested-aggregate-init.i", source, "global-nested-aggregate-init.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("g:");
    expect(asm).toContain("g:\t.db\t65");
    expect(asm).toContain("\t.dw\t66");
    expect(asm).toContain("\t.db\t67");
  });

  test("lowers file-scope aggregate char array field initializers", () => {
    const source = "struct Foo { char name[4]; int tail; };\nstruct Foo g = { \"AB$\", 67 };\nint main(){ return g.tail; }\n";
    const parsed = parseProgram(source, "global-aggregate-array-init.c");
    const bound = analyzeProgram(parsed, source, "global-aggregate-array-init.c");
    const spec = lowerSourceProgram(bound, "global-aggregate-array-init.i", source, "global-aggregate-array-init.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("g:");
    expect(asm).toContain("g:\t.db\t65,66,36,0");
    expect(asm).toContain("\t.dw\t67");
  });

  test("lowers nested local aggregate char array field initializers", () => {
    const source = "struct Inner { char name[4]; int code; };\nstruct Outer { struct Inner inner; char tail; };\nint main(){ struct Outer x = { { \"AB$\", 67 }, 68 }; return x.tail; }\n";
    const parsed = parseProgram(source, "nested-local-aggregate-array-init.c");
    const bound = analyzeProgram(parsed, source, "nested-local-aggregate-array-init.c");
    const spec = lowerSourceProgram(bound, "nested-local-aggregate-array-init.i", source, "nested-local-aggregate-array-init.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#65");
    expect(asm).toContain("\tld\thl,#66");
    expect(asm).toContain("\tld\thl,#36");
    expect(asm).toContain("\tld\thl,#0");
    expect(asm).toContain("\tld\thl,#67");
    expect(asm).toContain("\tld\thl,#68");
    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  test("lowers file-scope pointer declarations and assignments", () => {
    const source = "char buf[3] = { 65, 36, 0 };\nchar *gp;\nint main(){ gp = buf; return gp[0]; }\n";
    const parsed = parseProgram(source, "global-pointer.c");
    const bound = analyzeProgram(parsed, source, "global-pointer.c");
    const spec = lowerSourceProgram(bound, "global-pointer.i", source, "global-pointer.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\t.area\t_BSS");
    expect(asm).toContain("gp:\t.ds\t2");
    expect(asm).toContain("buf:");
  });

  test("lowers file-scope function pointers and indirect calls", () => {
    const source = "int putA(){ return 65; }\nint putB(){ return 66; }\nint (*fp)(void);\nint main(){ fp = &putA; fp(); fp = &putB; return fp(); }\n";
    const parsed = parseProgram(source, "global-function-pointer.c");
    const bound = analyzeProgram(parsed, source, "global-function-pointer.c");
    const spec = lowerSourceProgram(bound, "global-function-pointer.i", source, "global-function-pointer.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\t.area\t_BSS");
    expect(asm).toContain("fp:\t.ds\t2");
    expect(asm).toContain("ld\t(fp),hl");
    expect(asm).toContain("jp\t(hl)");
  });

  test("lowers file-scope initialized function pointers", () => {
    const source = "int putA(){ return 65; }\nint (*fp)(void) = &putA;\nint main(){ return fp(); }\n";
    const parsed = parseProgram(source, "global-function-pointer-init.c");
    const bound = analyzeProgram(parsed, source, "global-function-pointer-init.c");
    const spec = lowerSourceProgram(bound, "global-function-pointer-init.i", source, "global-function-pointer-init.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("fp:");
    expect(asm).toContain(".dw\tputA+0");
    expect(asm).toContain("jp\t(hl)");
  });

  test("lowers local and file-scope aggregate function pointer field initializers", () => {
    const localSource = "int putA(){ return 65; }\nstruct Foo { int (*fp)(void); char tail; };\nint main(){ struct Foo x = { &putA, 66 }; return x.tail; }\n";
    const localSpec = lowerSourceProgram(
      analyzeProgram(parseProgram(localSource, "local-aggregate-function-pointer-init.c"), localSource, "local-aggregate-function-pointer-init.c"),
      "local-aggregate-function-pointer-init.i",
      localSource,
      "local-aggregate-function-pointer-init.c",
    );
    const localAsm = emitProgram(localSpec);
    expect(localAsm).toContain("\tld\thl,#putA");
    expect(localAsm).toContain("\tld\t(hl),e");
    expect(localAsm).toContain("\tld\t(hl),d");
    expect(localAsm).toContain("\tld\thl,#66");

    const globalSource = "int putA(){ return 65; }\nstruct Foo { int (*fp)(void); char tail; };\nstruct Foo g = { &putA, 66 };\nint main(){ return g.tail; }\n";
    const globalSpec = lowerSourceProgram(
      analyzeProgram(parseProgram(globalSource, "global-aggregate-function-pointer-init.c"), globalSource, "global-aggregate-function-pointer-init.c"),
      "global-aggregate-function-pointer-init.i",
      globalSource,
      "global-aggregate-function-pointer-init.c",
    );
    const globalAsm = emitProgram(globalSpec);
    expect(globalAsm).toContain("g:");
    expect(globalAsm).toContain(".dw\tputA+0");
    expect(globalAsm).toContain("\t.db\t66");
  });

  test("lowers aggregate array field reads, writes, and incdec", () => {
    const source = "struct Foo { char name[4]; };\nint main(struct Foo *p){ struct Foo x; x.name[0] = 65; p->name[1] = 66; ++x.name[0]; p->name[1]--; return x.name[0] + p->name[1]; }\n";
    const parsed = parseProgram(source, "aggregate-array-field-access.c");
    const bound = analyzeProgram(parsed, source, "aggregate-array-field-access.c");
    const spec = lowerSourceProgram(bound, "aggregate-array-field-access.i", source, "aggregate-array-field-access.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toContain("\tadd\thl,de");
  });

  test("lowers aggregate function-pointer field calls", () => {
    const source = "int putA(){ return 65; }\nstruct Foo { int (*fp)(void); };\nint main(struct Foo *p){ struct Foo x; x.fp = &putA; p->fp = &putA; return x.fp() + p->fp(); }\n";
    const parsed = parseProgram(source, "aggregate-function-pointer-call.c");
    const bound = analyzeProgram(parsed, source, "aggregate-function-pointer-call.c");
    const spec = lowerSourceProgram(bound, "aggregate-function-pointer-call.i", source, "aggregate-function-pointer-call.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tjp\t\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toContain("\tld\thl,#putA");
  });

  test("lowers uninitialized file-scope aggregate storage into bss", () => {
    const source = "struct Foo { char a; int b; };\nstruct Foo g;\nint main(){ g.a = 65; g.b = 66; return g.a + g.b; }\n";
    const parsed = parseProgram(source, "global-aggregate-bss.c");
    const bound = analyzeProgram(parsed, source, "global-aggregate-bss.c");
    const spec = lowerSourceProgram(bound, "global-aggregate-bss.i", source, "global-aggregate-bss.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\t.area\t_BSS");
    expect(asm).toContain("g:\t.ds\t3");
  });

  test("lowers uninitialized file-scope scalar storage into bss", () => {
    const source = "int g;\nint main(){ g = 65; return g; }\n";
    const parsed = parseProgram(source, "global-scalar-bss.c");
    const bound = analyzeProgram(parsed, source, "global-scalar-bss.c");
    const spec = lowerSourceProgram(bound, "global-scalar-bss.i", source, "global-scalar-bss.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\t.area\t_BSS");
    expect(asm).toContain("g:\t.ds\t2");
  });

  test("lowers uninitialized file-scope char array storage into bss", () => {
    const source = "char buf[3];\nint main(){ buf[0] = 65; return buf[0]; }\n";
    const parsed = parseProgram(source, "global-array-bss.c");
    const bound = analyzeProgram(parsed, source, "global-array-bss.c");
    const spec = lowerSourceProgram(bound, "global-array-bss.i", source, "global-array-bss.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\t.area\t_BSS");
    expect(asm).toContain("buf:\t.ds\t3");
  });

  test("lowers nested pointer-member and dereferenced-member chains", () => {
    const source = "struct Inner { char a; int b; };\nstruct Outer { struct Inner inner; char tail; };\nint main(struct Outer *p){ p->inner.a = 65; (*p).inner.b = 66; return p->inner.a + (*p).inner.b + p->tail; }\n";
    const parsed = parseProgram(source, "nested-pointer-member.c");
    const bound = analyzeProgram(parsed, source, "nested-pointer-member.c");
    const spec = lowerSourceProgram(bound, "nested-pointer-member.i", source, "nested-pointer-member.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("lowers nested pointer-member compound assignment and incdec", () => {
    const source = "struct Inner { char a; int b; };\nstruct Outer { struct Inner inner; char tail; };\nint main(struct Outer *p){ p->inner.a = 65; (*p).inner.b = 65; p->inner.a += 1; ++(*p).inner.b; p->inner.a--; return p->inner.a + (*p).inner.b; }\n";
    const parsed = parseProgram(source, "nested-pointer-member-ops.c");
    const bound = analyzeProgram(parsed, source, "nested-pointer-member-ops.c");
    const spec = lowerSourceProgram(bound, "nested-pointer-member-ops.i", source, "nested-pointer-member-ops.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),e/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((asm.match(/\tld\ta,\(hl\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(asm).toContain("\tadd\thl,de");
  });

  test("lowers internal variadic calls with right-to-left slots and va_arg", () => {
    const source = "int sum(int first, ...){ va_list ap; va_start(ap, first); return first + va_arg(ap, int); }\nint main(){ return sum(10, 20); }\n";
    const parsed = parseProgram(source, "variadic.c");
    const bound = analyzeProgram(parsed, source, "variadic.c");
    const spec = lowerSourceProgram(bound, "variadic.i", source, "variadic.c");
    const asm = emitProgram(spec);

    expect(asm).toContain("\tld\thl,#20\n\tpush\thl\n\tld\thl,#10\n\tpush\thl\n\tcall\tsum");
    expect(asm).toContain("\tld\tc,(hl)");
    expect(asm).toContain("\tinc\tbc");
  });
});

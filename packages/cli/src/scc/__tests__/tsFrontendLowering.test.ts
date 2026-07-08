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

  test("lowers comma expressions by evaluating left then returning right", () => {
    const source = "int main(){ int x = 0; return x = 1, x += 2, x; }\n";
    const parsed = parseProgram(source, "comma.c");
    const bound = analyzeProgram(parsed, source, "comma.c");
    const spec = lowerSourceProgram(bound, "comma.i", source, "comma.c");
    const asm = emitProgram(spec);

    expect((asm.match(/\tld\t\(hl\),d/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(asm).toContain("\tadd\thl,de");
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

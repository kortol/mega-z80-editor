import { parseProgram } from "../tsFrontendParser";

describe("tsFrontendParser", () => {
  test("parses compare after additive with precedence scaffolding", () => {
    const program = parseProgram("int main(int a, int b, int c){ return a + b == c; }\n", "sample.c");
    const expr = program.functions[0].body.statements[0];
    expect(expr.kind).toBe("return");
    if (expr.kind !== "return") {
      return;
    }
    expect(expr.expr.kind).toBe("binary");
    if (expr.expr.kind !== "binary") {
      return;
    }
    expect(expr.expr.op).toBe("==");
    expect(expr.expr.left.kind).toBe("binary");
    if (expr.expr.left.kind === "binary") {
      expect(expr.expr.left.op).toBe("+");
    }
  });

  test("parses block-local declarations inside branches", () => {
    const program = parseProgram("int main(int a, int b){ if (a > b) { int x = 1; return x; } else { int y = 2; return y; } }\n");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("if");
    if (stmt.kind !== "if" || !stmt.elseBlock) {
      return;
    }
    expect(stmt.thenBlock.declarations).toHaveLength(1);
    expect(stmt.thenBlock.declarations[0]?.name).toBe("x");
    expect(stmt.elseBlock.declarations).toHaveLength(1);
    expect(stmt.elseBlock.declarations[0]?.name).toBe("y");
  });

  test("parses expression statements with string literal arguments", () => {
    const program = parseProgram("int main(){ outstr(\"HELLO$\"); return 0; }\n", "hello.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("expr");
    if (stmt.kind !== "expr" || stmt.expr.kind !== "call") {
      return;
    }
    expect(stmt.expr.target).toBe("outstr");
    expect(stmt.expr.args[0]).toEqual({ kind: "string", value: "HELLO$" });
  });

  test("parses unsized char array parameters as address-like params", () => {
    const program = parseProgram("int emit(char s[]){ outstr(s); return 0; }\n", "param-array.c");
    expect(program.functions[0].params[0]?.name).toBe("s");
    expect(program.functions[0].params[0]?.type).toEqual({ kind: "array", elementType: "char" });
  });

  test("parses indexing on unsized char array parameters", () => {
    const program = parseProgram("char first(char s[]){ return s[0]; }\n", "param-array-index.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "arrayIndex" || stmt.expr.index.kind !== "const") {
      return;
    }
    expect(stmt.expr.name).toBe("s");
    expect(stmt.expr.index.value).toBe(0);
  });

  test("parses left-associative additive expressions", () => {
    const program = parseProgram("int main(int a, int b, int c){ return a - b + c; }\n", "additive.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.op).toBe("+");
    expect(stmt.expr.left.kind).toBe("binary");
    if (stmt.expr.left.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left.op).toBe("-");
  });

  test("parses for loops with assignment clauses and continue/break statements", () => {
    const program = parseProgram("int main(){ int x = 65; for (x = 65; x < 68; x = x + 1) { if (x == 66) continue; break; } return x; }\n", "for-loop.c");
    const stmt = program.functions[0].body.statements[1];
    expect(stmt.kind).toBe("for");
    if (stmt.kind !== "for" || !stmt.initializer || !stmt.step) {
      return;
    }
    expect(stmt.initializer.kind).toBe("assign");
    expect(stmt.step.kind).toBe("assign");
    expect(stmt.body.statements[0]?.kind).toBe("if");
  });

  test("parses for-loop local declaration initializers and unary minus", () => {
    const program = parseProgram("int main(){ for (int x = -1; x < 1; x = x + 1) return x; }\n", "for-decl.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("for");
    if (stmt.kind !== "for" || !stmt.initializer || stmt.initializer.kind !== "localDecl" || !stmt.initializer.initializer) {
      return;
    }
    expect(stmt.initializer.name).toBe("x");
    expect(stmt.initializer.initializer.kind).toBe("binary");
    if (stmt.initializer.initializer.kind !== "binary") {
      return;
    }
    expect(stmt.initializer.initializer.op).toBe("-");
  });

  test("parses logical not as a zero-compare expression", () => {
    const program = parseProgram("int main(int a){ return !a; }\n", "not.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.op).toBe("==");
    expect(stmt.expr.right).toEqual({ kind: "const", value: 0 });
  });

  test("parses sizeof type and expr forms with unary precedence", () => {
    const program = parseProgram("int main(int a){ char buf[4]; return sizeof(char) + sizeof buf + sizeof a; }\n", "sizeof.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.op).toBe("+");
    expect(stmt.expr.left.kind).toBe("binary");
    if (stmt.expr.left.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left.left).toEqual({ kind: "sizeofType", type: { kind: "scalar", name: "char" } });
    expect(stmt.expr.left.right.kind).toBe("sizeofExpr");
    expect(stmt.expr.right.kind).toBe("sizeofExpr");
  });

  test("parses assignment expressions with right associativity", () => {
    const program = parseProgram("int main(){ int x; int y; return x = y = 3; }\n", "assign-expr.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "assign") {
      return;
    }
    expect(stmt.expr.name).toBe("x");
    expect(stmt.expr.expr.kind).toBe("assign");
  });

  test("parses array assignment expressions", () => {
    const program = parseProgram("int main(){ int i = 1; char buf[4]; return buf[i] = 65; }\n", "array-assign-expr.c");
    const stmt = program.functions[0].body.statements[1];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "arrayAssign") {
      return;
    }
    expect(stmt.expr.name).toBe("buf");
    expect(stmt.expr.index.kind).toBe("ref");
  });

  test("parses prefix and postfix increment/decrement expressions", () => {
    const program = parseProgram("int main(){ int i = 1; char buf[4]; return ++i + buf[i]--; }\n", "incdec-expr.c");
    const stmt = program.functions[0].body.statements[1];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left.kind).toBe("preIncDec");
    expect(stmt.expr.right.kind).toBe("postArrayIncDec");
  });

  test("parses compound assignment expressions", () => {
    const program = parseProgram("int main(){ int x = 1; char buf[4]; return x += 2 + (buf[0] |= 3); }\n", "compound-assign-expr.c");
    const stmt = program.functions[0].body.statements[1];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "assign" || stmt.expr.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.name).toBe("x");
    expect(stmt.expr.expr.op).toBe("+");
    expect(stmt.expr.expr.right.kind).toBe("binary");
    if (stmt.expr.expr.right.kind !== "binary") {
      return;
    }
    expect(stmt.expr.expr.right.left.kind).toBe("const");
    expect(stmt.expr.expr.right.right.kind).toBe("arrayAssign");
  });

  test("parses comma expressions with the lowest precedence", () => {
    const program = parseProgram("int main(){ int x = 0; return x = 1, x += 2, x; }\n", "comma.c");
    const stmt = program.functions[0].body.statements[1];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "comma") {
      return;
    }
    expect(stmt.expr.left.kind).toBe("assign");
    expect(stmt.expr.right.kind).toBe("comma");
  });

  test("parses pointer locals, address-of, and dereference", () => {
    const program = parseProgram("int main(){ int x = 66; int *p = &x; return *p; }\n", "pointer.c");
    expect(program.functions[0].body.declarations[1]?.type).toEqual({ kind: "pointer", pointee: "int" });
    const stmt = program.functions[0].body.statements[2];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return") {
      return;
    }
    expect(stmt.expr).toEqual({ kind: "deref", expr: { kind: "ref", name: "p" } });
  });

  test("parses dereference assignment expressions", () => {
    const program = parseProgram("int main(){ char buf[2]; char *p = buf; return *p = 65; }\n", "pointer-assign.c");
    expect(program.functions[0].body.declarations[1]?.type).toEqual({ kind: "pointer", pointee: "char" });
    const stmt = program.functions[0].body.statements[1];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "derefAssign") {
      return;
    }
    expect(stmt.expr.target.kind).toBe("deref");
  });

  test("parses address-of array elements and pointer indexing", () => {
    const program = parseProgram("int main(){ int i = 1; char buf[3]; char *p = &buf[i]; return p[0]; }\n", "pointer-index.c");
    expect(program.functions[0].body.declarations[2]?.type).toEqual({ kind: "pointer", pointee: "char" });
    expect(program.functions[0].body.declarations[2]?.initializer).toEqual({
      kind: "addressOfExpr",
      expr: { kind: "arrayIndex", name: "buf", index: { kind: "ref", name: "i" } },
    });
    const stmt = program.functions[0].body.statements[2];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return") {
      return;
    }
    expect(stmt.expr).toEqual({ kind: "arrayIndex", name: "p", index: { kind: "const", value: 0 } });
  });

  test("parses pointer indexing writes and pointer arithmetic dereference", () => {
    const program = parseProgram("int main(){ char buf[3]; char *p = buf; p[1] = 66; return *(p + 1); }\n", "pointer-arith.c");
    const assignStmt = program.functions[0].body.statements[1];
    expect(assignStmt.kind).toBe("arrayAssign");
    if (assignStmt.kind !== "arrayAssign") {
      return;
    }
    expect(assignStmt.name).toBe("p");
    const returnStmt = program.functions[0].body.statements[2];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "deref") {
      return;
    }
    expect(returnStmt.expr.expr.kind).toBe("binary");
  });

  test("parses int pointer indexing and scaled pointer arithmetic", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int *p = &x; return p[1] + *(p + 1); }\n", "int-pointer.c");
    expect(program.functions[0].body.declarations[2]?.type).toEqual({ kind: "pointer", pointee: "int" });
    const returnStmt = program.functions[0].body.statements[3];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("arrayIndex");
    expect(returnStmt.expr.right.kind).toBe("deref");
  });

  test("parses pointer subtraction with a unary-minus rhs", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int *p = &x; return *(p - -1); }\n", "int-pointer-neg.c");
    const returnStmt = program.functions[0].body.statements[3];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "deref") {
      return;
    }
    expect(returnStmt.expr.expr.kind).toBe("binary");
    if (returnStmt.expr.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.expr.op).toBe("-");
    expect(returnStmt.expr.expr.right.kind).toBe("binary");
  });

  test("parses pointer compound assignment on locals", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int *p = &x; p += 1; return *p; }\n", "pointer-compound.c");
    const assignStmt = program.functions[0].body.statements[3];
    expect(assignStmt.kind).toBe("assign");
    if (assignStmt.kind !== "assign" || assignStmt.expr.kind !== "binary") {
      return;
    }
    expect(assignStmt.name).toBe("p");
    expect(assignStmt.expr.op).toBe("+");
  });

  test("parses pointer prefix and postfix increment expressions", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int *p = &x; return *(++p) + *(p++); }\n", "pointer-incdec.c");
    const returnStmt = program.functions[0].body.statements[3];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("deref");
    expect(returnStmt.expr.right.kind).toBe("deref");
  });

  test("parses pointer prefix and postfix decrement expressions", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int *p = &y; return *(--p) + *(p--); }\n", "pointer-decdec.c");
    const returnStmt = program.functions[0].body.statements[3];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("deref");
    expect(returnStmt.expr.right.kind).toBe("deref");
  });

  test("parses pointer subtract compound assignment on locals", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int *p = &y; p -= 1; return *p; }\n", "pointer-compound-sub.c");
    const assignStmt = program.functions[0].body.statements[3];
    expect(assignStmt.kind).toBe("assign");
    if (assignStmt.kind !== "assign" || assignStmt.expr.kind !== "binary") {
      return;
    }
    expect(assignStmt.name).toBe("p");
    expect(assignStmt.expr.op).toBe("-");
  });

  test("parses dynamic int pointer indexing and arithmetic", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int z = 67; int i = 1; int *p = &x; return p[i] + *(p + i); }\n", "int-pointer-dynamic.c");
    const returnStmt = program.functions[0].body.statements[5];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("arrayIndex");
    expect(returnStmt.expr.right.kind).toBe("deref");
  });

  test("parses dynamic int pointer indexed writes", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int z = 67; int i = 1; int *p = &x; p[i] = z; return *(p + i); }\n", "int-pointer-dynamic-write.c");
    const assignStmt = program.functions[0].body.statements[5];
    expect(assignStmt.kind).toBe("arrayAssign");
    if (assignStmt.kind !== "arrayAssign") {
      return;
    }
    expect(assignStmt.name).toBe("p");
    const returnStmt = program.functions[0].body.statements[6];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "deref") {
      return;
    }
    expect(returnStmt.expr.expr.kind).toBe("binary");
  });

  test("parses pointer equality and inequality compares", () => {
    const program = parseProgram("int main(){ int x = 65; int *p = &x; int *q = &x; return (p == q) + (p != q); }\n", "pointer-compare.c");
    const returnStmt = program.functions[0].body.statements[3];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("binary");
    expect(returnStmt.expr.right.kind).toBe("binary");
  });

  test("parses pointer and integer equality/inequality compares in both orders", () => {
    const program = parseProgram("int main(){ int x = 65; int *p = &x; return (p == 0) + (0 == p) + (p != 0) + (0 != p); }\n", "pointer-int-compare.c");
    const returnStmt = program.functions[0].body.statements[2];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("binary");
    expect(returnStmt.expr.right.kind).toBe("binary");
  });

  test("parses pointer truthiness conditions", () => {
    const program = parseProgram("int main(){ int x = 65; int *p = &x; if (p) return 1; if (!p) return 2; return 3; }\n", "pointer-truthy.c");
    expect(program.functions[0].body.statements[2]?.kind).toBe("if");
    expect(program.functions[0].body.statements[3]?.kind).toBe("if");
  });

  test("parses int pointer parameters and calls", () => {
    const program = parseProgram("int second(int *p){ return p[1]; }\nint main(){ int x = 65; int y = 66; return second(&x); }\n", "pointer-param.c");
    expect(program.functions[0].params[0]?.type).toEqual({ kind: "pointer", pointee: "int" });
    const calleeReturn = program.functions[0].body.statements[0];
    expect(calleeReturn.kind).toBe("return");
    if (calleeReturn.kind !== "return") {
      return;
    }
    expect(calleeReturn.expr.kind).toBe("arrayIndex");
    const mainReturn = program.functions[1].body.statements[2];
    expect(mainReturn.kind).toBe("return");
    if (mainReturn.kind !== "return") {
      return;
    }
    expect(mainReturn.expr.kind).toBe("call");
  });

  test("parses opaque struct and union pointer params", () => {
    const program = parseProgram("int check(struct Foo *p, union Bar *q){ if (p) return q != 0; return p == 0; }\n", "aggregate-pointer.c");
    expect(program.functions[0].params[0]?.type).toEqual({
      kind: "pointer",
      pointee: { kind: "aggregate", aggregateKind: "struct", name: "Foo" },
    });
    expect(program.functions[0].params[1]?.type).toEqual({
      kind: "pointer",
      pointee: { kind: "aggregate", aggregateKind: "union", name: "Bar" },
    });
  });

  test("parses aggregate definitions and sizeof aggregate types", () => {
    const program = parseProgram("struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ return sizeof(struct Foo) + sizeof(union Bar); }\n", "aggregate-sizeof.c");
    expect(program.aggregates).toHaveLength(2);
    expect(program.aggregates[0]?.fields).toHaveLength(2);
    const returnStmt = program.functions[0].body.statements[0];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("sizeofType");
    expect(returnStmt.expr.right.kind).toBe("sizeofType");
  });

  test("parses logical and/or with lower precedence than compare", () => {
    const program = parseProgram("int main(int a, int b, int c){ return a == b || b == c && c; }\n", "logical.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.op).toBe("||");
    expect(stmt.expr.right.kind).toBe("binary");
    if (stmt.expr.right.kind !== "binary") {
      return;
    }
    expect(stmt.expr.right.op).toBe("&&");
  });

  test("parses ternary conditional expressions as right-associative low-precedence expressions", () => {
    const program = parseProgram("int main(int a, int b, int c, int d){ return a || b ? c : d ? a : b; }\n", "conditional.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "conditional") {
      return;
    }
    expect(stmt.expr.condition.kind).toBe("binary");
    expect(stmt.expr.thenExpr).toEqual({ kind: "ref", name: "c" });
    expect(stmt.expr.elseExpr.kind).toBe("conditional");
  });

  test("parses bitwise operators between logical and compare precedence levels", () => {
    const program = parseProgram("int main(int a, int b, int c){ return a | b ^ c & a == b; }\n", "bitwise.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.op).toBe("|");
    expect(stmt.expr.right.kind).toBe("binary");
    if (stmt.expr.right.kind !== "binary") {
      return;
    }
    expect(stmt.expr.right.op).toBe("^");
  });

  test("parses bitwise not as xor with 65535", () => {
    const program = parseProgram("int main(int a){ return ~a; }\n", "bitnot.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.op).toBe("^");
    expect(stmt.expr.right).toEqual({ kind: "const", value: 65535 });
  });

  test("parses multiplicative before additive and shift before compare", () => {
    const program = parseProgram("int main(int a, int b, int c, int d){ return a + b * c << d == c; }\n", "ops.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.op).toBe("==");
    expect(stmt.expr.left.kind).toBe("binary");
    if (stmt.expr.left.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left.op).toBe("<<");
    if (stmt.expr.left.left.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left.left.op).toBe("+");
  });

  test("parses local char arrays and constant index expressions", () => {
    const program = parseProgram("int main(){ char buf[16]; return buf[3]; }\n", "array.c");
    expect(program.functions[0].body.declarations[0]?.type).toEqual({ kind: "array", elementType: "char", length: 16 });
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return") {
      return;
    }
    expect(stmt.expr).toEqual({ kind: "arrayIndex", name: "buf", index: { kind: "const", value: 3 } });
  });

  test("parses local char array constant index assignments", () => {
    const program = parseProgram("int main(){ char buf[4]; buf[2] = 65; return buf[2]; }\n", "array-assign.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt).toEqual({ kind: "arrayAssign", name: "buf", index: { kind: "const", value: 2 }, expr: { kind: "const", value: 65 } });
  });

  test("parses local char array dynamic index expressions and assignments", () => {
    const program = parseProgram("int main(){ int i = 1; char buf[4]; buf[i + 1] = 65; return buf[i]; }\n", "array-dynamic.c");
    const assignStmt = program.functions[0].body.statements[1];
    expect(assignStmt.kind).toBe("arrayAssign");
    if (assignStmt.kind !== "arrayAssign" || assignStmt.index.kind !== "binary") {
      return;
    }
    expect(assignStmt.index.op).toBe("+");
    const returnStmt = program.functions[0].body.statements[2];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "arrayIndex" || returnStmt.expr.index.kind !== "ref") {
      return;
    }
    expect(returnStmt.expr.index.name).toBe("i");
  });

  test("parses increment and decrement simple statements via assignment lowering", () => {
    const program = parseProgram("int main(){ int i = 0; char buf[4]; i++; buf[i]--; return i; }\n", "inc-dec.c");
    const incStmt = program.functions[0].body.statements[1];
    expect(incStmt.kind).toBe("assign");
    if (incStmt.kind !== "assign" || incStmt.expr.kind !== "binary") {
      return;
    }
    expect(incStmt.expr.op).toBe("+");
    const decStmt = program.functions[0].body.statements[2];
    expect(decStmt.kind).toBe("arrayAssign");
    if (decStmt.kind !== "arrayAssign" || decStmt.expr.kind !== "binary") {
      return;
    }
    expect(decStmt.expr.op).toBe("-");
  });

  test("parses prefix increment and decrement simple statements via assignment lowering", () => {
    const program = parseProgram("int main(){ int i = 0; char buf[4]; ++i; --buf[i]; return i; }\n", "prefix-inc-dec.c");
    const incStmt = program.functions[0].body.statements[1];
    expect(incStmt.kind).toBe("assign");
    if (incStmt.kind !== "assign" || incStmt.expr.kind !== "binary") {
      return;
    }
    expect(incStmt.expr.op).toBe("+");
    const decStmt = program.functions[0].body.statements[2];
    expect(decStmt.kind).toBe("arrayAssign");
    if (decStmt.kind !== "arrayAssign" || decStmt.expr.kind !== "binary") {
      return;
    }
    expect(decStmt.expr.op).toBe("-");
  });

  test("parses compound assignment simple statements via assignment lowering", () => {
    const program = parseProgram("int main(){ int i = 1; char buf[4]; i += 2; buf[i] -= 3; return i; }\n", "compound-assign.c");
    const addStmt = program.functions[0].body.statements[1];
    expect(addStmt.kind).toBe("assign");
    if (addStmt.kind !== "assign" || addStmt.expr.kind !== "binary") {
      return;
    }
    expect(addStmt.expr.op).toBe("+");
    const subStmt = program.functions[0].body.statements[2];
    expect(subStmt.kind).toBe("arrayAssign");
    if (subStmt.kind !== "arrayAssign" || subStmt.expr.kind !== "binary") {
      return;
    }
    expect(subStmt.expr.op).toBe("-");
  });

  test("parses wider compound assignment operators via assignment lowering", () => {
    const program = parseProgram("int main(){ int x = 3; char buf[4]; x <<= 1; buf[0] |= 2; x *= 4; return x; }\n", "compound-ops.c");
    const shiftStmt = program.functions[0].body.statements[1];
    expect(shiftStmt.kind).toBe("assign");
    if (shiftStmt.kind !== "assign" || shiftStmt.expr.kind !== "binary") {
      return;
    }
    expect(shiftStmt.expr.op).toBe("<<");
    const orStmt = program.functions[0].body.statements[2];
    expect(orStmt.kind).toBe("arrayAssign");
    if (orStmt.kind !== "arrayAssign" || orStmt.expr.kind !== "binary") {
      return;
    }
    expect(orStmt.expr.op).toBe("|");
    const mulStmt = program.functions[0].body.statements[3];
    expect(mulStmt.kind).toBe("assign");
    if (mulStmt.kind !== "assign" || mulStmt.expr.kind !== "binary") {
      return;
    }
    expect(mulStmt.expr.op).toBe("*");
  });

  test("parses switch statements with case and default blocks", () => {
    const program = parseProgram("int main(int x){ switch (x) { case 65: outchar(65); break; case 66: outchar(66); default: outchar(67); } return 0; }\n", "switch.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("switch");
    if (stmt.kind !== "switch") {
      return;
    }
    expect(stmt.cases).toHaveLength(2);
    expect(stmt.cases[0]?.value).toBe(65);
    expect(stmt.cases[1]?.value).toBe(66);
    expect(stmt.defaultCase?.statements[0]?.kind).toBe("expr");
  });

  test("parses do-while loops with single-statement bodies", () => {
    const program = parseProgram("int main(){ int x = 65; do x = x + 1; while (x < 68); return x; }\n", "do-while.c");
    const stmt = program.functions[0].body.statements[1];
    expect(stmt.kind).toBe("doWhile");
    if (stmt.kind !== "doWhile") {
      return;
    }
    expect(stmt.body.statements[0]?.kind).toBe("assign");
    expect(stmt.condition.kind).toBe("binary");
  });
});

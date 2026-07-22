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

  test("parses pointer-indexed assignment and compound assignment expressions", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int z = 67; int i = 1; int *p = &x; return (p[i] = z) + (p[i] |= 3); }\n", "pointer-index-assign-expr.c");
    const stmt = program.functions[0].body.statements[5];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left).toEqual({
      kind: "arrayAssign",
      name: "p",
      index: { kind: "ref", name: "i" },
      expr: { kind: "ref", name: "z" },
    });
    expect(stmt.expr.right).toEqual({
      kind: "arrayAssign",
      name: "p",
      index: { kind: "ref", name: "i" },
      expr: {
        kind: "binary",
        left: { kind: "arrayIndex", name: "p", index: { kind: "ref", name: "i" } },
        op: "|",
        right: { kind: "const", value: 3 },
      },
    });
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

  test("parses pointer-indexed prefix and postfix increment/decrement expressions", () => {
    const program = parseProgram("int main(){ int x = 1; int y = 2; int i = 1; int *p = &x; return ++p[i] + p[i]--; }\n", "pointer-index-incdec-expr.c");
    const stmt = program.functions[0].body.statements[4];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left).toEqual({
      kind: "preArrayIncDec",
      name: "p",
      index: { kind: "ref", name: "i" },
      op: "++",
    });
    expect(stmt.expr.right).toEqual({
      kind: "postArrayIncDec",
      name: "p",
      index: { kind: "ref", name: "i" },
      op: "--",
    });
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

  test("parses dereference compound assignment and incdec expressions", () => {
    const program = parseProgram("int main(){ int x = 1; int *p = &x; return (*p += 2) + (++*p) + ((*p)--); }\n", "pointer-deref-ops.c");
    const stmt = program.functions[0].body.statements[2];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary" || stmt.expr.left.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left.left).toEqual({
      kind: "derefAssign",
      target: { kind: "deref", expr: { kind: "ref", name: "p" } },
      expr: {
        kind: "binary",
        left: { kind: "deref", expr: { kind: "ref", name: "p" } },
        op: "+",
        right: { kind: "const", value: 2 },
      },
    });
    expect(stmt.expr.left.right).toEqual({
      kind: "preDerefIncDec",
      target: { kind: "deref", expr: { kind: "ref", name: "p" } },
      op: "++",
    });
    expect(stmt.expr.right).toEqual({
      kind: "postDerefIncDec",
      target: { kind: "deref", expr: { kind: "ref", name: "p" } },
      op: "--",
    });
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

  test("parses address-of dereference cancellation and pointer-index element address", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int i = 1; int *p = &x; return (&*p == p) + *(&p[i]); }\n", "pointer-address-cancel.c");
    const stmt = program.functions[0].body.statements[4];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left).toEqual({
      kind: "binary",
      left: { kind: "addressOfExpr", expr: { kind: "deref", expr: { kind: "ref", name: "p" } } },
      op: "==",
      right: { kind: "ref", name: "p" },
    });
    expect(stmt.expr.right).toEqual({
      kind: "deref",
      expr: {
        kind: "addressOfExpr",
        expr: { kind: "arrayIndex", name: "p", index: { kind: "ref", name: "i" } },
      },
    });
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

  test("parses pointer relational compares", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int *p = &x; int *q = &y; return (p < q) + (p <= q) + (q > p) + (q >= p); }\n", "pointer-rel-compare.c");
    const body = program.functions[0].body.statements;
    const returnStmt = body[body.length - 1];
    expect(returnStmt?.kind).toBe("return");
    if (!returnStmt || returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
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

  test("parses dereference truthiness in if/while/for conditions", () => {
    const program = parseProgram("int main(){ int x = 2; int *p = &x; if (*p) while (*p) { (*p)--; } for (; *p; ++p) { break; } return x; }\n", "deref-truthy.c");
    const ifStmt = program.functions[0].body.statements[2];
    expect(ifStmt.kind).toBe("if");
    if (ifStmt.kind !== "if") {
      return;
    }
    expect(ifStmt.condition.kind).toBe("deref");
    expect(ifStmt.thenBlock.statements[0]?.kind).toBe("while");
    const whileStmt = ifStmt.thenBlock.statements[0];
    if (!whileStmt || whileStmt.kind !== "while") {
      return;
    }
    expect(whileStmt.condition.kind).toBe("deref");
    const forStmt = program.functions[0].body.statements[3];
    expect(forStmt.kind).toBe("for");
    if (forStmt.kind !== "for" || !forStmt.condition || !forStmt.step || forStmt.step.kind !== "expr") {
      return;
    }
    expect(forStmt.condition.kind).toBe("deref");
    expect(forStmt.step.expr.kind).toBe("preIncDec");
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

  test("parses local aggregate declarations, sizeof locals, and address-of aggregate objects", () => {
    const source = "struct Foo { char a; int b; };\nint take(struct Foo *p){ return p != 0; }\nint main(){ struct Foo x; return sizeof x + take(&x); }\n";
    const program = parseProgram(source, "aggregate-local.c");
    expect(program.functions[1].body.declarations[0]?.type).toEqual({
      kind: "aggregate",
      aggregateKind: "struct",
      name: "Foo",
    });
    const returnStmt = program.functions[1].body.statements[0];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.left).toEqual({ kind: "sizeofExpr", expr: { kind: "ref", name: "x" } });
    expect(returnStmt.expr.right.kind).toBe("call");
    if (returnStmt.expr.right.kind !== "call") {
      return;
    }
    expect(returnStmt.expr.right.args[0]).toEqual({ kind: "addressOf", name: "x" });
  });

  test("parses local aggregate pointers initialized from aggregate object addresses", () => {
    const source = "struct Foo { char a; int b; };\nint take(struct Foo *p){ return p != 0; }\nint main(){ struct Foo x; struct Foo *p = &x; return take(p) + (p != 0); }\n";
    const program = parseProgram(source, "aggregate-local-pointer.c");
    expect(program.functions[1].body.declarations[1]).toEqual({
      kind: "localDecl",
      name: "p",
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "struct", name: "Foo" } },
      initializer: { kind: "addressOf", name: "x" },
    });
  });

  test("parses local union pointers initialized from union object addresses", () => {
    const source = "union Bar { char a; int b; };\nint take(union Bar *p){ return p != 0; }\nint main(){ union Bar x; union Bar *p = &x; return take(p) + (p != 0); }\n";
    const program = parseProgram(source, "union-local-pointer.c");
    expect(program.functions[1].body.declarations[0]?.type).toEqual({
      kind: "aggregate",
      aggregateKind: "union",
      name: "Bar",
    });
    expect(program.functions[1].body.declarations[1]).toEqual({
      kind: "localDecl",
      name: "p",
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "union", name: "Bar" } },
      initializer: { kind: "addressOf", name: "x" },
    });
  });

  test("parses aggregate pointer assignment after declaration", () => {
    const source = "struct Foo { char a; int b; };\nint take(struct Foo *p){ return p != 0; }\nint main(){ struct Foo x; struct Foo *p; p = &x; return take(p) + (p != 0); }\n";
    const program = parseProgram(source, "aggregate-pointer-assign.c");
    expect(program.functions[1].body.declarations[1]).toEqual({
      kind: "localDecl",
      name: "p",
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "struct", name: "Foo" } },
    });
    const assignStmt = program.functions[1].body.statements[0];
    expect(assignStmt).toEqual({
      kind: "assign",
      name: "p",
      expr: { kind: "addressOf", name: "x" },
    });
  });

  test("parses union pointer assignment after declaration", () => {
    const source = "union Bar { char a; int b; };\nint take(union Bar *p){ return p != 0; }\nint main(){ union Bar x; union Bar *p; p = &x; return take(p) + (p != 0); }\n";
    const program = parseProgram(source, "union-pointer-assign.c");
    expect(program.functions[1].body.declarations[1]).toEqual({
      kind: "localDecl",
      name: "p",
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "union", name: "Bar" } },
    });
    const assignStmt = program.functions[1].body.statements[0];
    expect(assignStmt).toEqual({
      kind: "assign",
      name: "p",
      expr: { kind: "addressOf", name: "x" },
    });
  });

  test("parses aggregate pointer null assignment and reassignment", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ struct Foo x; struct Foo *p; p = 0; p = &x; if (p) return p != 0; return 0; }\n";
    const program = parseProgram(source, "aggregate-pointer-null.c");
    const firstAssign = program.functions[0].body.statements[0];
    const secondAssign = program.functions[0].body.statements[1];
    expect(firstAssign).toEqual({
      kind: "assign",
      name: "p",
      expr: { kind: "const", value: 0 },
    });
    expect(secondAssign).toEqual({
      kind: "assign",
      name: "p",
      expr: { kind: "addressOf", name: "x" },
    });
    expect(program.functions[0].body.statements[2]?.kind).toBe("if");
  });

  test("parses union pointer null assignment and reassignment", () => {
    const source = "union Bar { char a; int b; };\nint main(){ union Bar x; union Bar *p; p = 0; p = &x; if (p) return p != 0; return 0; }\n";
    const program = parseProgram(source, "union-pointer-null.c");
    const firstAssign = program.functions[0].body.statements[0];
    const secondAssign = program.functions[0].body.statements[1];
    expect(firstAssign).toEqual({
      kind: "assign",
      name: "p",
      expr: { kind: "const", value: 0 },
    });
    expect(secondAssign).toEqual({
      kind: "assign",
      name: "p",
      expr: { kind: "addressOf", name: "x" },
    });
    expect(program.functions[0].body.statements[2]?.kind).toBe("if");
  });

  test("parses direct aggregate address compares and truthiness", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ struct Foo x; if (&x) return &x != 0; return 0; }\n";
    const program = parseProgram(source, "aggregate-address-direct.c");
    const ifStmt = program.functions[0].body.statements[0];
    expect(ifStmt?.kind).toBe("if");
    if (ifStmt?.kind !== "if") {
      return;
    }
    expect(ifStmt.condition).toEqual({ kind: "addressOf", name: "x" });
    expect(ifStmt.thenBlock.statements[0]).toEqual({
      kind: "return",
      expr: {
        kind: "binary",
        op: "!=",
        left: { kind: "addressOf", name: "x" },
        right: { kind: "const", value: 0 },
      },
    });
  });

  test("parses direct union address compares and truthiness", () => {
    const source = "union Bar { char a; int b; };\nint main(){ union Bar x; if (&x) return &x != 0; return 0; }\n";
    const program = parseProgram(source, "union-address-direct.c");
    const ifStmt = program.functions[0].body.statements[0];
    expect(ifStmt?.kind).toBe("if");
    if (ifStmt?.kind !== "if") {
      return;
    }
    expect(ifStmt.condition).toEqual({ kind: "addressOf", name: "x" });
    expect(ifStmt.thenBlock.statements[0]).toEqual({
      kind: "return",
      expr: {
        kind: "binary",
        op: "!=",
        left: { kind: "addressOf", name: "x" },
        right: { kind: "const", value: 0 },
      },
    });
  });

  test("parses mixed aggregate sizeof and direct address compare expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ struct Foo x; return sizeof x + (&x != 0); }\n";
    const program = parseProgram(source, "aggregate-mixed-expr.c");
    const returnStmt = program.functions[0].body.statements[0];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.left).toEqual({ kind: "sizeofExpr", expr: { kind: "ref", name: "x" } });
    expect(returnStmt.expr.right).toEqual({
      kind: "binary",
      op: "!=",
      left: { kind: "addressOf", name: "x" },
      right: { kind: "const", value: 0 },
    });
  });

  test("parses mixed union sizeof and direct address conditional expressions", () => {
    const source = "union Bar { char a; int b; };\nint main(){ union Bar x; return sizeof x + (&x ? 1 : 0); }\n";
    const program = parseProgram(source, "union-mixed-expr.c");
    const returnStmt = program.functions[0].body.statements[0];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.left).toEqual({ kind: "sizeofExpr", expr: { kind: "ref", name: "x" } });
    expect(returnStmt.expr.right).toEqual({
      kind: "conditional",
      condition: { kind: "addressOf", name: "x" },
      thenExpr: { kind: "const", value: 1 },
      elseExpr: { kind: "const", value: 0 },
    });
  });

  test("keeps aggregate subset parse boundaries explicit", () => {
    const parseThroughCases: Array<{
      source: string;
      file: string;
      assert(program: ReturnType<typeof parseProgram>): void;
    }> = [
      {
        source: "struct Foo { char a; int b; };\nint main(){ struct Foo **pp; return 0; }\n",
        file: "aggregate-pointer-pointer.c",
        assert(program) {
          expect(program.functions[0].body.declarations[0]?.type).toEqual({
            kind: "pointer",
            pointee: {
              kind: "pointer",
              pointee: {
                kind: "aggregate",
                aggregateKind: "struct",
                name: "Foo",
              },
            },
          });
        },
      },
      {
        source: "union Bar { char a; int b; };\nint main(){ union Bar **pp; return 0; }\n",
        file: "union-pointer-pointer.c",
        assert(program) {
          expect(program.functions[0].body.declarations[0]?.type).toEqual({
            kind: "pointer",
            pointee: {
              kind: "pointer",
              pointee: {
                kind: "aggregate",
                aggregateKind: "union",
                name: "Bar",
              },
            },
          });
        },
      },
      {
        source: "struct Foo { char a; int b; };\nint main(){ struct Foo x; return &(&x) != 0; }\n",
        file: "aggregate-double-address.c",
        assert(program) {
          expect(program.functions[0].body.statements[0]?.kind).toBe("return");
        },
      },
      {
        source: "struct Foo { char a; int b; };\nint main(){ struct Foo x; return x; }\n",
        file: "aggregate-return-value.c",
        assert(program) {
          expect(program.functions[0].body.statements[0]).toEqual({
            kind: "return",
            expr: { kind: "ref", name: "x" },
          });
        },
      },
      {
        source: "struct Foo { char a; int b; };\nint main(){ struct Foo x; struct Foo y; x = y; return 0; }\n",
        file: "aggregate-assign-value.c",
        assert(program) {
          expect(program.functions[0].body.statements[0]).toEqual({
            kind: "assign",
            name: "x",
            expr: { kind: "ref", name: "y" },
          });
        },
      },
      {
        source: "struct Foo { char a; int b; };\nint take(int n){ return n; }\nint main(){ struct Foo x; return take(x); }\n",
        file: "aggregate-call-value.c",
        assert(program) {
          expect(program.functions[1].body.statements[0]).toEqual({
            kind: "return",
            expr: { kind: "call", target: "take", args: [{ kind: "ref", name: "x" }] },
          });
        },
      },
      {
        source: "struct Foo { char a; int b; };\nint main(int c){ struct Foo x; struct Foo y; return c ? x : y; }\n",
        file: "aggregate-conditional-value.c",
        assert(program) {
          expect(program.functions[0].body.statements[0]).toEqual({
            kind: "return",
            expr: {
              kind: "conditional",
              condition: { kind: "ref", name: "c" },
              thenExpr: { kind: "ref", name: "x" },
              elseExpr: { kind: "ref", name: "y" },
            },
          });
        },
      },
      {
        source: "struct Foo { char a; int b; };\nint main(){ struct Foo x; struct Foo y; return (x, y); }\n",
        file: "aggregate-comma-value.c",
        assert(program) {
          expect(program.functions[0].body.statements[0]).toEqual({
            kind: "return",
            expr: { kind: "comma", left: { kind: "ref", name: "x" }, right: { kind: "ref", name: "y" } },
          });
        },
      },
      {
        source: "struct Foo { char a; int b; };\nint main(){ struct Foo x; if (x) return 1; return 0; }\n",
        file: "aggregate-truthiness-value.c",
        assert(program) {
          expect(program.functions[0].body.statements[0]).toEqual({
            kind: "if",
            condition: { kind: "ref", name: "x" },
            thenBlock: { kind: "block", declarations: [], statements: [{ kind: "return", expr: { kind: "const", value: 1 } }] },
          });
        },
      },
      {
        source: "struct Foo { char a; int b; };\nint main(){ struct Foo x; return x == 0; }\n",
        file: "aggregate-compare-value.c",
        assert(program) {
          expect(program.functions[0].body.statements[0]).toEqual({
            kind: "return",
            expr: {
              kind: "binary",
              op: "==",
              left: { kind: "ref", name: "x" },
              right: { kind: "const", value: 0 },
            },
          });
        },
      },
    ];
    for (const testCase of parseThroughCases) {
      testCase.assert(parseProgram(testCase.source, testCase.file));
    }
  });

  test("parses local struct and union member reads", () => {
    const source = "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ struct Foo x; union Bar u; return x.a + x.b + u.a + u.b; }\n";
    const program = parseProgram(source, "aggregate-member-read.c");
    const returnStmt = program.functions[0].body.statements[0];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("binary");
    expect(returnStmt.expr.right).toEqual({ kind: "memberAccess", name: "u", field: "b" });
  });

  test("parses local struct and union member writes", () => {
    const source = "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ struct Foo x; union Bar u; x.a = 1; x.b = 2; u.a = 3; u.b = 4; return x.a + x.b + u.a + u.b; }\n";
    const program = parseProgram(source, "aggregate-member-write.c");
    expect(program.functions[0].body.statements[0]).toEqual({
      kind: "memberAssign",
      name: "x",
      field: "a",
      expr: { kind: "const", value: 1 },
    });
    expect(program.functions[0].body.statements[3]).toEqual({
      kind: "memberAssign",
      name: "u",
      field: "b",
      expr: { kind: "const", value: 4 },
    });
  });

  test("parses aggregate pointer member reads and writes", () => {
    const source = "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(struct Foo *p, union Bar *q){ p->a = 1; p->b = 2; q->a = 3; q->b = 4; return p->a + p->b + q->a + q->b; }\n";
    const program = parseProgram(source, "aggregate-pointer-member.c");
    expect(program.functions[0].body.statements[0]).toEqual({
      kind: "pointerMemberAssign",
      name: "p",
      field: "a",
      expr: { kind: "const", value: 1 },
    });
    const returnStmt = program.functions[0].body.statements[4];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.right).toEqual({ kind: "pointerMemberAccess", name: "q", field: "b" });
  });

  test("parses address-of on aggregate fields", () => {
    const source = "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(struct Foo *p){ struct Foo x; return first(&x.a) + second(&x.b) + first(&p->a) + second(&p->b); }\n";
    const program = parseProgram(source, "aggregate-field-address.c");
    const returnStmt = program.functions[2].body.statements[0];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "binary") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("binary");
    expect(returnStmt.expr.right).toEqual({
      kind: "call",
      target: "second",
      args: [{ kind: "addressOfExpr", expr: { kind: "pointerMemberAccess", name: "p", field: "b" } }],
    });
  });

  test("parses aggregate field compound assignments and incdec statements", () => {
    const source = "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(struct Foo *p, union Bar *q){ x.a += 1; x.b -= 2; ++u.a; u.b--; p->a += 3; p->b -= 4; ++q->a; q->b--; return x.a + x.b + u.a + u.b + p->a + p->b + q->a + q->b; }\n";
    const program = parseProgram(source.replace("int main(struct Foo *p, union Bar *q){", "int main(struct Foo *p, union Bar *q){ struct Foo x; union Bar u; "), "aggregate-field-ops.c");
    expect(program.functions[0].body.statements[0]).toEqual({
      kind: "memberAssign",
      name: "x",
      field: "a",
      expr: {
        kind: "binary",
        left: { kind: "memberAccess", name: "x", field: "a" },
        op: "+",
        right: { kind: "const", value: 1 },
      },
    });
    expect(program.functions[0].body.statements[7]).toEqual({
      kind: "pointerMemberAssign",
      name: "q",
      field: "b",
      expr: {
        kind: "binary",
        left: { kind: "pointerMemberAccess", name: "q", field: "b" },
        op: "-",
        right: { kind: "const", value: 1 },
      },
    });
  });

  test("parses aggregate field assignment expressions and incdec expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(struct Foo *p){ struct Foo x; return (x.a += 3) + (++x.b) + (p->a = 4) + (p->b--); }\n";
    const program = parseProgram(source, "aggregate-field-expr-ops.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "binary" || stmt.expr.left.kind !== "binary" || stmt.expr.left.left.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left.left.left).toEqual({
      kind: "memberAssign",
      name: "x",
      field: "a",
      expr: {
        kind: "binary",
        left: { kind: "memberAccess", name: "x", field: "a" },
        op: "+",
        right: { kind: "const", value: 3 },
      },
    });
    expect(stmt.expr.left.left.right).toEqual({
      kind: "preMemberIncDec",
      name: "x",
      field: "b",
      op: "++",
    });
    expect(stmt.expr.left.right).toEqual({
      kind: "pointerMemberAssign",
      name: "p",
      field: "a",
      expr: { kind: "const", value: 4 },
    });
    expect(stmt.expr.right).toEqual({
      kind: "postPointerMemberIncDec",
      name: "p",
      field: "b",
      op: "--",
    });
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

  test("parses pointer-valued ternary conditional expressions", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int c = 1; int *p = &x; int *q = &y; return *(c ? p : q) + *(c ? p : 0); }\n", "pointer-conditional.c");
    const body = program.functions[0].body.statements;
    const stmt = body[body.length - 1];
    expect(stmt?.kind).toBe("return");
    if (!stmt || stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left).toEqual({
      kind: "deref",
      expr: {
        kind: "conditional",
        condition: { kind: "ref", name: "c" },
        thenExpr: { kind: "ref", name: "p" },
        elseExpr: { kind: "ref", name: "q" },
      },
    });
    expect(stmt.expr.right).toEqual({
      kind: "deref",
      expr: {
        kind: "conditional",
        condition: { kind: "ref", name: "c" },
        thenExpr: { kind: "ref", name: "p" },
        elseExpr: { kind: "const", value: 0 },
      },
    });
  });

  test("parses pointer-valued conditional assignment and compare expressions", () => {
    const program = parseProgram("int main(){ int x = 65; int y = 66; int c = 1; int *p = &x; int *q = &y; p = c ? p : q; return (p != 0) + ((c ? p : q) == p); }\n", "pointer-conditional-assign.c");
    const body = program.functions[0].body.statements;
    expect(body[5]).toEqual({
      kind: "assign",
      name: "p",
      expr: {
        kind: "conditional",
        condition: { kind: "ref", name: "c" },
        thenExpr: { kind: "ref", name: "p" },
        elseExpr: { kind: "ref", name: "q" },
      },
    });
    const stmt = body[6];
    expect(stmt?.kind).toBe("return");
    if (!stmt || stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left).toEqual({
      kind: "binary",
      left: { kind: "ref", name: "p" },
      op: "!=",
      right: { kind: "const", value: 0 },
    });
    expect(stmt.expr.right).toEqual({
      kind: "binary",
      left: {
        kind: "conditional",
        condition: { kind: "ref", name: "c" },
        thenExpr: { kind: "ref", name: "p" },
        elseExpr: { kind: "ref", name: "q" },
      },
      op: "==",
      right: { kind: "ref", name: "p" },
    });
  });

  test("parses aggregate-pointer-valued conditional expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return (c ? p : q) == p; }\n";
    const program = parseProgram(source, "aggregate-pointer-conditional.c");
    const body = program.functions[0].body.statements;
    const stmt = body[body.length - 1];
    expect(stmt?.kind).toBe("return");
    if (!stmt || stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left).toEqual({
      kind: "conditional",
      condition: { kind: "ref", name: "c" },
      thenExpr: { kind: "ref", name: "p" },
      elseExpr: { kind: "ref", name: "q" },
    });
    expect(stmt.expr.op).toBe("==");
    expect(stmt.expr.right).toEqual({ kind: "ref", name: "p" });
  });

  test("parses pointer-member access on conditional pointer expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return (c ? p : q)->a + (c ? p : q)->b; }\n";
    const program = parseProgram(source, "aggregate-pointer-member-conditional.c");
    const body = program.functions[0].body.statements;
    const stmt = body[body.length - 1];
    expect(stmt?.kind).toBe("return");
    if (!stmt || stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left).toEqual({
      kind: "pointerMemberExprAccess",
      target: {
        kind: "conditional",
        condition: { kind: "ref", name: "c" },
        thenExpr: { kind: "ref", name: "p" },
        elseExpr: { kind: "ref", name: "q" },
      },
      field: "a",
    });
    expect(stmt.expr.right).toEqual({
      kind: "pointerMemberExprAccess",
      target: {
        kind: "conditional",
        condition: { kind: "ref", name: "c" },
        thenExpr: { kind: "ref", name: "p" },
        elseExpr: { kind: "ref", name: "q" },
      },
      field: "b",
    });
  });

  test("parses address-of on pointer-member access from conditional pointer expressions", () => {
    const source = "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return first(&(c ? p : q)->a) + second(&(c ? p : q)->b); }\n";
    const program = parseProgram(source, "aggregate-pointer-member-conditional-address.c");
    const body = program.functions[2].body.statements;
    const stmt = body[body.length - 1];
    expect(stmt?.kind).toBe("return");
    if (!stmt || stmt.kind !== "return" || stmt.expr.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left).toEqual({
      kind: "call",
      target: "first",
      args: [{
        kind: "addressOfExpr",
        expr: {
          kind: "pointerMemberExprAccess",
          target: {
            kind: "conditional",
            condition: { kind: "ref", name: "c" },
            thenExpr: { kind: "ref", name: "p" },
            elseExpr: { kind: "ref", name: "q" },
          },
          field: "a",
        },
      }],
    });
    expect(stmt.expr.right).toEqual({
      kind: "call",
      target: "second",
      args: [{
        kind: "addressOfExpr",
        expr: {
          kind: "pointerMemberExprAccess",
          target: {
            kind: "conditional",
            condition: { kind: "ref", name: "c" },
            thenExpr: { kind: "ref", name: "p" },
            elseExpr: { kind: "ref", name: "q" },
          },
          field: "b",
        },
      }],
    });
  });

  test("parses dereferenced aggregate member reads and address-of", () => {
    const source = "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint second(int *p){ return p[0]; }\nint main(struct Foo *p){ return (*p).a + (*p).b + first(&(*p).a) + second(&(*p).b); }\n";
    const program = parseProgram(source, "aggregate-deref-member-read.c");
    const stmt = program.functions[2].body.statements[0];
    expect(stmt?.kind).toBe("return");
    if (!stmt || stmt.kind !== "return" || stmt.expr.kind !== "binary" || stmt.expr.left.kind !== "binary" || stmt.expr.left.left.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left.left.left).toEqual({
      kind: "memberExprAccess",
      target: { kind: "deref", expr: { kind: "ref", name: "p" } },
      field: "a",
    });
    expect(stmt.expr.left.left.right).toEqual({
      kind: "memberExprAccess",
      target: { kind: "deref", expr: { kind: "ref", name: "p" } },
      field: "b",
    });
  });

  test("parses pointer-member writes on conditional pointer expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; (c ? p : q)->a = 1; (c ? p : q)->b += 2; return x.a + x.b + y.a + y.b; }\n";
    const program = parseProgram(source, "aggregate-pointer-member-conditional-write.c");
    expect(program.functions[0].body.statements[3]).toEqual({
      kind: "pointerMemberExprAssign",
      target: {
        kind: "conditional",
        condition: { kind: "ref", name: "c" },
        thenExpr: { kind: "ref", name: "p" },
        elseExpr: { kind: "ref", name: "q" },
      },
      field: "a",
      expr: { kind: "const", value: 1 },
    });
    expect(program.functions[0].body.statements[4]).toEqual({
      kind: "pointerMemberExprAssign",
      target: {
        kind: "conditional",
        condition: { kind: "ref", name: "c" },
        thenExpr: { kind: "ref", name: "p" },
        elseExpr: { kind: "ref", name: "q" },
      },
      field: "b",
      expr: {
        kind: "binary",
        left: {
          kind: "pointerMemberExprAccess",
          target: {
            kind: "conditional",
            condition: { kind: "ref", name: "c" },
            thenExpr: { kind: "ref", name: "p" },
            elseExpr: { kind: "ref", name: "q" },
          },
          field: "b",
        },
        op: "+",
        right: { kind: "const", value: 2 },
      },
    });
  });

  test("parses pointer-member incdec on conditional pointer expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; ++(c ? p : q)->a; (c ? p : q)->b--; return x.a + x.b + y.a + y.b; }\n";
    const program = parseProgram(source, "aggregate-pointer-member-conditional-incdec.c");
    expect(program.functions[0].body.statements[3]).toEqual({
      kind: "expr",
      expr: {
        kind: "prePointerMemberExprIncDec",
        target: {
          kind: "conditional",
          condition: { kind: "ref", name: "c" },
          thenExpr: { kind: "ref", name: "p" },
          elseExpr: { kind: "ref", name: "q" },
        },
        field: "a",
        op: "++",
      },
    });
    expect(program.functions[0].body.statements[4]).toEqual({
      kind: "expr",
      expr: {
        kind: "postPointerMemberExprIncDec",
        target: {
          kind: "conditional",
          condition: { kind: "ref", name: "c" },
          thenExpr: { kind: "ref", name: "p" },
          elseExpr: { kind: "ref", name: "q" },
        },
        field: "b",
        op: "--",
      },
    });
  });

  test("parses pointer-member assignment and incdec expressions on conditional pointer expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return ((c ? p : q)->a = 4) + (++(c ? p : q)->b) + ((c ? p : q)->a--); }\n";
    const program = parseProgram(source, "aggregate-pointer-member-conditional-expr-ops.c");
    const stmt = program.functions[0].body.statements[3];
    expect(stmt?.kind).toBe("return");
    if (!stmt || stmt.kind !== "return" || stmt.expr.kind !== "binary" || stmt.expr.left.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left.left).toEqual({
      kind: "pointerMemberExprAssign",
      target: {
        kind: "conditional",
        condition: { kind: "ref", name: "c" },
        thenExpr: { kind: "ref", name: "p" },
        elseExpr: { kind: "ref", name: "q" },
      },
      field: "a",
      expr: { kind: "const", value: 4 },
    });
    expect(stmt.expr.left.right).toEqual({
      kind: "prePointerMemberExprIncDec",
      target: {
        kind: "conditional",
        condition: { kind: "ref", name: "c" },
        thenExpr: { kind: "ref", name: "p" },
        elseExpr: { kind: "ref", name: "q" },
      },
      field: "b",
      op: "++",
    });
    expect(stmt.expr.right).toEqual({
      kind: "postPointerMemberExprIncDec",
      target: {
        kind: "conditional",
        condition: { kind: "ref", name: "c" },
        thenExpr: { kind: "ref", name: "p" },
        elseExpr: { kind: "ref", name: "q" },
      },
      field: "a",
      op: "--",
    });
  });

  test("parses dereferenced aggregate member assignment and incdec expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(struct Foo *p){ return ((*p).a = 4) + (++(*p).b) + ((*p).a--); }\n";
    const program = parseProgram(source, "aggregate-deref-member-expr-ops.c");
    const stmt = program.functions[0].body.statements[0];
    expect(stmt?.kind).toBe("return");
    if (!stmt || stmt.kind !== "return" || stmt.expr.kind !== "binary" || stmt.expr.left.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left.left).toEqual({
      kind: "memberExprAssign",
      target: { kind: "deref", expr: { kind: "ref", name: "p" } },
      field: "a",
      expr: { kind: "const", value: 4 },
    });
    expect(stmt.expr.left.right).toEqual({
      kind: "preMemberExprIncDec",
      target: { kind: "deref", expr: { kind: "ref", name: "p" } },
      field: "b",
      op: "++",
    });
    expect(stmt.expr.right).toEqual({
      kind: "postMemberExprIncDec",
      target: { kind: "deref", expr: { kind: "ref", name: "p" } },
      field: "a",
      op: "--",
    });
  });

  test("parses dereferenced conditional aggregate pointer member operations", () => {
    const source = "struct Foo { char a; int b; };\nchar first(char *p){ return p[0]; }\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; return (*(c ? p : q)).a + first(&(*(c ? p : q)).a) + ((*(c ? p : q)).b = 3) + ((*(c ? p : q)).a--); }\n";
    const program = parseProgram(source, "aggregate-deref-conditional-member-ops.c");
    const stmt = program.functions[1].body.statements[3];
    expect(stmt?.kind).toBe("return");
    if (!stmt || stmt.kind !== "return" || stmt.expr.kind !== "binary" || stmt.expr.left.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left.left.kind).toBe("binary");
    if (stmt.expr.left.left.kind !== "binary") {
      return;
    }
    expect(stmt.expr.left.left.left).toEqual({
      kind: "memberExprAccess",
      target: {
        kind: "deref",
        expr: {
          kind: "conditional",
          condition: { kind: "ref", name: "c" },
          thenExpr: { kind: "ref", name: "p" },
          elseExpr: { kind: "ref", name: "q" },
        },
      },
      field: "a",
    });
    expect(stmt.expr.right).toEqual({
      kind: "postMemberExprIncDec",
      target: {
        kind: "deref",
        expr: {
          kind: "conditional",
          condition: { kind: "ref", name: "c" },
          thenExpr: { kind: "ref", name: "p" },
          elseExpr: { kind: "ref", name: "q" },
        },
      },
      field: "a",
      op: "--",
    });
  });

  test("parses dereferenced conditional aggregate pointer member statements", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ int c = 1; struct Foo x; struct Foo y; struct Foo *p = &x; struct Foo *q = &y; (*(c ? p : q)).a = 1; (*(c ? p : q)).b += 2; ++(*(c ? p : q)).a; (*(c ? p : q)).b--; return x.a + x.b + y.a + y.b; }\n";
    const program = parseProgram(source, "aggregate-deref-conditional-member-stmt.c");
    expect(program.functions[0].body.statements[3]).toEqual({
      kind: "memberExprAssign",
      target: {
        kind: "deref",
        expr: {
          kind: "conditional",
          condition: { kind: "ref", name: "c" },
          thenExpr: { kind: "ref", name: "p" },
          elseExpr: { kind: "ref", name: "q" },
        },
      },
      field: "a",
      expr: { kind: "const", value: 1 },
    });
    expect(program.functions[0].body.statements[4]).toEqual({
      kind: "memberExprAssign",
      target: {
        kind: "deref",
        expr: {
          kind: "conditional",
          condition: { kind: "ref", name: "c" },
          thenExpr: { kind: "ref", name: "p" },
          elseExpr: { kind: "ref", name: "q" },
        },
      },
      field: "b",
      expr: {
        kind: "binary",
        left: {
          kind: "memberExprAccess",
          target: {
            kind: "deref",
            expr: {
              kind: "conditional",
              condition: { kind: "ref", name: "c" },
              thenExpr: { kind: "ref", name: "p" },
              elseExpr: { kind: "ref", name: "q" },
            },
          },
          field: "b",
        },
        op: "+",
        right: { kind: "const", value: 2 },
      },
    });
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

  test("parses char array string literal initializers with inferred and explicit lengths", () => {
    const inferred = parseProgram("int main(){ char buf[] = \"AB\"; return buf[1]; }\n", "array-string-init-inferred.c");
    expect(inferred.functions[0].body.declarations[0]?.type).toEqual({ kind: "array", elementType: "char", length: 3 });
    expect(inferred.functions[0].body.statements[0]).toEqual({
      kind: "arrayAssign",
      name: "buf",
      index: { kind: "const", value: 0 },
      expr: { kind: "const", value: 65 },
    });
    expect(inferred.functions[0].body.statements[2]).toEqual({
      kind: "arrayAssign",
      name: "buf",
      index: { kind: "const", value: 2 },
      expr: { kind: "const", value: 0 },
    });

    const explicit = parseProgram("int main(){ char buf[4] = \"AB\"; return buf[3]; }\n", "array-string-init-explicit.c");
    expect(explicit.functions[0].body.declarations[0]?.type).toEqual({ kind: "array", elementType: "char", length: 4 });
    expect(explicit.functions[0].body.statements[2]).toEqual({
      kind: "arrayAssign",
      name: "buf",
      index: { kind: "const", value: 2 },
      expr: { kind: "const", value: 0 },
    });
    expect(explicit.functions[0].body.statements[3]).toEqual({
      kind: "arrayAssign",
      name: "buf",
      index: { kind: "const", value: 3 },
      expr: { kind: "const", value: 0 },
    });
  });

  test("parses exact-fit char array string literal initializers without trailing zero fill", () => {
    const program = parseProgram("int main(){ char buf[2] = \"AB\"; return buf[1]; }\n", "array-string-init-exact-fit.c");
    expect(program.functions[0].body.declarations[0]?.type).toEqual({ kind: "array", elementType: "char", length: 2 });
    expect(program.functions[0].body.statements[0]).toEqual({
      kind: "arrayAssign",
      name: "buf",
      index: { kind: "const", value: 0 },
      expr: { kind: "const", value: 65 },
    });
    expect(program.functions[0].body.statements[1]).toEqual({
      kind: "arrayAssign",
      name: "buf",
      index: { kind: "const", value: 1 },
      expr: { kind: "const", value: 66 },
    });
    expect(program.functions[0].body.statements).toHaveLength(3);
  });

  test("rejects overflowing char array string literal initializers", () => {
    expect(() => parseProgram("int main(){ char buf[2] = \"ABC\"; return 0; }\n", "array-string-init-overflow.c")).toThrow(/does not fit in length 2/);
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

  test("parses dereference simple statements and for-loop steps", () => {
    const program = parseProgram("int main(){ int x = 0; int *p = &x; ++*p; *p += 2; (*p)--; for (; x < 3; ++*p) { break; } return x; }\n", "deref-simple.c");
    const firstStmt = program.functions[0].body.statements[2];
    expect(firstStmt.kind).toBe("expr");
    if (firstStmt.kind !== "expr") {
      return;
    }
    expect(firstStmt.expr.kind).toBe("preDerefIncDec");
    const secondStmt = program.functions[0].body.statements[3];
    expect(secondStmt.kind).toBe("expr");
    if (secondStmt.kind !== "expr") {
      return;
    }
    expect(secondStmt.expr.kind).toBe("derefAssign");
    const thirdStmt = program.functions[0].body.statements[4];
    expect(thirdStmt.kind).toBe("expr");
    if (thirdStmt.kind !== "expr") {
      return;
    }
    expect(thirdStmt.expr.kind).toBe("postDerefIncDec");
    const loopStmt = program.functions[0].body.statements[5];
    expect(loopStmt.kind).toBe("for");
    if (loopStmt.kind !== "for" || !loopStmt.step || loopStmt.step.kind !== "expr") {
      return;
    }
    expect(loopStmt.step.expr.kind).toBe("preDerefIncDec");
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

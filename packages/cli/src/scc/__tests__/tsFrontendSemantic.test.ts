import { TsFrontendError } from "../tsFrontendDiagnostics";
import { parseProgram } from "../tsFrontendParser";
import { analyzeProgram } from "../tsFrontendSemantic";

describe("tsFrontendSemantic", () => {
  test("rejects duplicate function names", () => {
    const source = "int main(){ return 1; }\nint main(){ return 2; }\n";
    const parsed = parseProgram(source, "dup.c");
    expect(() => analyzeProgram(parsed, source, "dup.c")).toThrow(TsFrontendError);
  });

  test("binds unsized char array parameters as address-like scalar params", () => {
    const source = "int emit(char s[]){ outstr(s); return 0; }\n";
    const parsed = parseProgram(source, "param-array.c");
    const bound = analyzeProgram(parsed, source, "param-array.c");
    expect(bound.functions[0].params[0]?.type).toEqual({ kind: "array", elementType: "char" });
  });

  test("binds indexing on unsized char array parameters as address-based array reads", () => {
    const source = "char first(char s[]){ return s[0]; }\n";
    const parsed = parseProgram(source, "param-array-index.c");
    const bound = analyzeProgram(parsed, source, "param-array-index.c");
    const stmt = bound.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return") {
      return;
    }
    expect(stmt.expr.kind).toBe("paramArrayElement");
  });

  test("binds assignment to unsized char array parameters as address-based array writes", () => {
    const source = "int setfirst(char s[]){ s[0] = 65; return 0; }\n";
    const parsed = parseProgram(source, "param-array-write.c");
    const bound = analyzeProgram(parsed, source, "param-array-write.c");
    const stmt = bound.functions[0].body.statements[0];
    expect(stmt.kind).toBe("arrayAssign");
    if (stmt.kind !== "arrayAssign") {
      return;
    }
    expect(stmt.target.kind).toBe("param");
  });

  test("binds ternary conditional expressions", () => {
    const source = "int main(int a, int b, int c){ return a ? b : c; }\n";
    const parsed = parseProgram(source, "conditional.c");
    const bound = analyzeProgram(parsed, source, "conditional.c");
    const stmt = bound.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "conditional") {
      return;
    }
    expect(stmt.expr.condition.kind).toBe("ref");
    expect(stmt.expr.thenExpr.kind).toBe("ref");
    expect(stmt.expr.elseExpr.kind).toBe("ref");
  });

  test("folds sizeof supported types and expressions into integer constants", () => {
    const source = "int main(int a){ char buf[4]; return sizeof(char) + sizeof buf + sizeof a; }\n";
    const parsed = parseProgram(source, "sizeof.c");
    const bound = analyzeProgram(parsed, source, "sizeof.c");
    const stmt = bound.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "additive") {
      return;
    }
    expect(stmt.expr.left.kind).toBe("additive");
    if (stmt.expr.left.kind !== "additive") {
      return;
    }
    expect(stmt.expr.left.left).toEqual({ kind: "const", value: 1, type: { kind: "scalar", name: "int", width: 2 } });
    expect(stmt.expr.left.right).toEqual({ kind: "const", value: 4, type: { kind: "scalar", name: "int", width: 2 } });
    expect(stmt.expr.right).toEqual({ kind: "const", value: 2, type: { kind: "scalar", name: "int", width: 2 } });
  });

  test("binds assignment expressions on local scalars", () => {
    const source = "int main(){ int x; int y; return x = y = 3; }\n";
    const parsed = parseProgram(source, "assign-expr.c");
    const bound = analyzeProgram(parsed, source, "assign-expr.c");
    const stmt = bound.functions[0].body.statements[0];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "assign") {
      return;
    }
    expect(stmt.expr.local.name).toBe("x");
    expect(stmt.expr.expr.kind).toBe("assign");
  });

  test("binds assignment expressions on char array elements", () => {
    const source = "int main(){ int i = 1; char buf[4]; return buf[i] = 65; }\n";
    const parsed = parseProgram(source, "array-assign-expr.c");
    const bound = analyzeProgram(parsed, source, "array-assign-expr.c");
    const stmt = bound.functions[0].body.statements[1];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "arrayAssignExpr") {
      return;
    }
    expect(stmt.expr.target.kind).toBe("local");
    expect(stmt.expr.index.kind).toBe("ref");
  });

  test("binds prefix and postfix increment/decrement expressions", () => {
    const source = "int main(){ int i = 1; char buf[4]; return ++i + buf[i]--; }\n";
    const parsed = parseProgram(source, "incdec-expr.c");
    const bound = analyzeProgram(parsed, source, "incdec-expr.c");
    const stmt = bound.functions[0].body.statements[1];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "additive") {
      return;
    }
    expect(stmt.expr.left.kind).toBe("preIncDec");
    expect(stmt.expr.right.kind).toBe("postArrayIncDec");
  });

  test("binds compound assignment expressions through assignment forms", () => {
    const source = "int main(){ int x = 1; char buf[4]; return x += 2 + (buf[0] |= 3); }\n";
    const parsed = parseProgram(source, "compound-assign-expr.c");
    const bound = analyzeProgram(parsed, source, "compound-assign-expr.c");
    const stmt = bound.functions[0].body.statements[1];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "assign") {
      return;
    }
    expect(stmt.expr.local.name).toBe("x");
    expect(stmt.expr.expr.kind).toBe("additive");
    if (stmt.expr.expr.kind !== "additive") {
      return;
    }
    expect(stmt.expr.expr.right.kind).toBe("additive");
    if (stmt.expr.expr.right.kind !== "additive") {
      return;
    }
    expect(stmt.expr.expr.right.right.kind).toBe("arrayAssignExpr");
  });

  test("binds comma expressions and preserves the rightmost value type", () => {
    const source = "int main(){ int x = 0; return x = 1, x += 2, x; }\n";
    const parsed = parseProgram(source, "comma.c");
    const bound = analyzeProgram(parsed, source, "comma.c");
    const stmt = bound.functions[0].body.statements[1];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "comma") {
      return;
    }
    expect(stmt.expr.left.kind).toBe("assign");
    expect(stmt.expr.right.kind).toBe("comma");
    expect(stmt.expr.type).toEqual({ kind: "scalar", name: "int", width: 2 });
  });

  test("binds pointer locals and dereference reads", () => {
    const source = "int main(){ int x = 66; int *p = &x; return *p; }\n";
    const parsed = parseProgram(source, "pointer.c");
    const bound = analyzeProgram(parsed, source, "pointer.c");
    expect(bound.functions[0].locals[1]?.type).toEqual({ kind: "pointer", pointee: "int", width: 2 });
    const stmt = bound.functions[0].body.statements[2];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "deref") {
      return;
    }
    expect(stmt.expr.type).toEqual({ kind: "scalar", name: "int", width: 2 });
  });

  test("binds pointer dereference assignment expressions", () => {
    const source = "int main(){ char buf[2]; char *p = buf; return *p = 65; }\n";
    const parsed = parseProgram(source, "pointer-assign.c");
    const bound = analyzeProgram(parsed, source, "pointer-assign.c");
    const stmt = bound.functions[0].body.statements[1];
    expect(stmt.kind).toBe("return");
    if (stmt.kind !== "return" || stmt.expr.kind !== "derefAssign") {
      return;
    }
    expect(stmt.expr.type).toEqual({ kind: "scalar", name: "char", width: 1 });
  });

  test("binds address-of array elements and pointer indexing", () => {
    const source = "int main(){ int i = 1; char buf[3]; char *p = &buf[i]; return p[0]; }\n";
    const parsed = parseProgram(source, "pointer-index.c");
    const bound = analyzeProgram(parsed, source, "pointer-index.c");
    expect(bound.functions[0].locals[2]?.type).toEqual({ kind: "pointer", pointee: "char", width: 2 });
    const initStmt = bound.functions[0].body.statements[1];
    expect(initStmt.kind).toBe("assign");
    if (initStmt.kind !== "assign" || initStmt.expr.kind !== "pointerAdd") {
      return;
    }
    expect(initStmt.expr.type).toEqual({ kind: "pointer", pointee: "char", width: 2 });
    const returnStmt = bound.functions[0].body.statements[2];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "deref") {
      return;
    }
    expect(returnStmt.expr.pointer.kind).toBe("pointerAdd");
  });

  test("binds pointer indexing writes and pointer arithmetic dereference", () => {
    const source = "int main(){ char buf[3]; char *p = buf; p[1] = 66; return *(p + 1); }\n";
    const parsed = parseProgram(source, "pointer-arith.c");
    const bound = analyzeProgram(parsed, source, "pointer-arith.c");
    const assignStmt = bound.functions[0].body.statements[1];
    expect(assignStmt.kind).toBe("expr");
    if (assignStmt.kind !== "expr" || assignStmt.expr.kind !== "derefAssign") {
      return;
    }
    expect(assignStmt.expr.pointer.kind).toBe("pointerAdd");
    const returnStmt = bound.functions[0].body.statements[2];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "deref") {
      return;
    }
    expect(returnStmt.expr.pointer.kind).toBe("pointerAdd");
  });

  test("binds int pointer indexing and scaled pointer arithmetic", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &x; return p[1] + *(p + 1); }\n";
    const parsed = parseProgram(source, "int-pointer.c");
    const bound = analyzeProgram(parsed, source, "int-pointer.c");
    expect(bound.functions[0].locals[2]?.type).toEqual({ kind: "pointer", pointee: "int", width: 2 });
    const returnStmt = bound.functions[0].body.statements[3];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("deref");
    expect(returnStmt.expr.right.kind).toBe("deref");
  });

  test("binds backward int pointer arithmetic through scaled pointer subtraction", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &y; return *(p - 1); }\n";
    const parsed = parseProgram(source, "int-pointer-backward.c");
    const bound = analyzeProgram(parsed, source, "int-pointer-backward.c");
    const returnStmt = bound.functions[0].body.statements[3];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "deref") {
      return;
    }
    expect(returnStmt.expr.pointer.kind).toBe("pointerAdd");
    if (returnStmt.expr.pointer.kind !== "pointerAdd") {
      return;
    }
    expect(returnStmt.expr.pointer.index.kind).toBe("additive");
  });

  test("binds pointer compound assignment through pointerAdd", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &x; p += 1; return *p; }\n";
    const parsed = parseProgram(source, "pointer-compound.c");
    const bound = analyzeProgram(parsed, source, "pointer-compound.c");
    const assignStmt = bound.functions[0].body.statements[3];
    expect(assignStmt.kind).toBe("assign");
    if (assignStmt.kind !== "assign") {
      return;
    }
    expect(assignStmt.local.type).toEqual({ kind: "pointer", pointee: "int", width: 2 });
    expect(assignStmt.expr.kind).toBe("pointerAdd");
  });

  test("binds pointer prefix and postfix increment expressions", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &x; return *(++p) + *(p++); }\n";
    const parsed = parseProgram(source, "pointer-incdec.c");
    const bound = analyzeProgram(parsed, source, "pointer-incdec.c");
    const returnStmt = bound.functions[0].body.statements[3];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("deref");
    expect(returnStmt.expr.right.kind).toBe("deref");
    if (returnStmt.expr.left.kind !== "deref" || returnStmt.expr.right.kind !== "deref") {
      return;
    }
    expect(returnStmt.expr.left.pointer.kind).toBe("preIncDec");
    expect(returnStmt.expr.right.pointer.kind).toBe("postIncDec");
  });

  test("binds pointer prefix and postfix decrement expressions", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &y; return *(--p) + *(p--); }\n";
    const parsed = parseProgram(source, "pointer-decdec.c");
    const bound = analyzeProgram(parsed, source, "pointer-decdec.c");
    const returnStmt = bound.functions[0].body.statements[3];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("deref");
    expect(returnStmt.expr.right.kind).toBe("deref");
    if (returnStmt.expr.left.kind !== "deref" || returnStmt.expr.right.kind !== "deref") {
      return;
    }
    expect(returnStmt.expr.left.pointer.kind).toBe("preIncDec");
    expect(returnStmt.expr.right.pointer.kind).toBe("postIncDec");
  });

  test("binds pointer subtract compound assignment through pointerAdd", () => {
    const source = "int main(){ int x = 65; int y = 66; int *p = &y; p -= 1; return *p; }\n";
    const parsed = parseProgram(source, "pointer-compound-sub.c");
    const bound = analyzeProgram(parsed, source, "pointer-compound-sub.c");
    const assignStmt = bound.functions[0].body.statements[3];
    expect(assignStmt.kind).toBe("assign");
    if (assignStmt.kind !== "assign") {
      return;
    }
    expect(assignStmt.local.type).toEqual({ kind: "pointer", pointee: "int", width: 2 });
    expect(assignStmt.expr.kind).toBe("pointerAdd");
  });

  test("binds dynamic int pointer indexing and arithmetic through scaled pointerAdd", () => {
    const source = "int main(){ int x = 65; int y = 66; int z = 67; int i = 1; int *p = &x; return p[i] + *(p + i); }\n";
    const parsed = parseProgram(source, "int-pointer-dynamic.c");
    const bound = analyzeProgram(parsed, source, "int-pointer-dynamic.c");
    const returnStmt = bound.functions[0].body.statements[5];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("deref");
    expect(returnStmt.expr.right.kind).toBe("deref");
    if (returnStmt.expr.left.kind !== "deref" || returnStmt.expr.right.kind !== "deref") {
      return;
    }
    expect(returnStmt.expr.left.pointer.kind).toBe("pointerAdd");
    expect(returnStmt.expr.right.pointer.kind).toBe("pointerAdd");
    if (returnStmt.expr.left.pointer.kind !== "pointerAdd" || returnStmt.expr.right.pointer.kind !== "pointerAdd") {
      return;
    }
    expect(returnStmt.expr.left.pointer.index.kind).toBe("ref");
    expect(returnStmt.expr.right.pointer.index.kind).toBe("ref");
  });

  test("binds dynamic int pointer indexed writes through derefAssign", () => {
    const source = "int main(){ int x = 65; int y = 66; int z = 67; int i = 1; int *p = &x; p[i] = z; return *(p + i); }\n";
    const parsed = parseProgram(source, "int-pointer-dynamic-write.c");
    const bound = analyzeProgram(parsed, source, "int-pointer-dynamic-write.c");
    const assignStmt = bound.functions[0].body.statements[5];
    expect(assignStmt.kind).toBe("expr");
    if (assignStmt.kind !== "expr" || assignStmt.expr.kind !== "derefAssign") {
      return;
    }
    expect(assignStmt.expr.pointer.kind).toBe("pointerAdd");
    if (assignStmt.expr.pointer.kind !== "pointerAdd") {
      return;
    }
    expect(assignStmt.expr.pointer.index.kind).toBe("ref");
    const returnStmt = bound.functions[0].body.statements[6];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "deref") {
      return;
    }
    expect(returnStmt.expr.pointer.kind).toBe("pointerAdd");
  });

  test("binds pointer equality and inequality compares through compare exprs", () => {
    const source = "int main(){ int x = 65; int *p = &x; int *q = &x; return (p == q) + (p != q); }\n";
    const parsed = parseProgram(source, "pointer-compare.c");
    const bound = analyzeProgram(parsed, source, "pointer-compare.c");
    const returnStmt = bound.functions[0].body.statements[3];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("compare");
    expect(returnStmt.expr.right.kind).toBe("compare");
    if (returnStmt.expr.left.kind !== "compare" || returnStmt.expr.right.kind !== "compare") {
      return;
    }
    expect(returnStmt.expr.left.op).toBe("==");
    expect(returnStmt.expr.right.op).toBe("!=");
  });

  test("binds pointer and integer equality/inequality compares in both orders", () => {
    const source = "int main(){ int x = 65; int *p = &x; return (p == 0) + (0 == p) + (p != 0) + (0 != p); }\n";
    const parsed = parseProgram(source, "pointer-int-compare.c");
    const bound = analyzeProgram(parsed, source, "pointer-int-compare.c");
    const returnStmt = bound.functions[0].body.statements[2];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("additive");
    expect(returnStmt.expr.right.kind).toBe("compare");
    if (returnStmt.expr.left.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left.left.kind).toBe("additive");
    expect(returnStmt.expr.left.right.kind).toBe("compare");
  });

  test("binds pointer truthiness conditions", () => {
    const source = "int main(){ int x = 65; int *p = &x; if (p) return 1; if (!p) return 2; return 3; }\n";
    const parsed = parseProgram(source, "pointer-truthy.c");
    const bound = analyzeProgram(parsed, source, "pointer-truthy.c");
    const firstIf = bound.functions[0].body.statements[2];
    expect(firstIf.kind).toBe("if");
    if (firstIf.kind !== "if") {
      return;
    }
    expect(firstIf.condition.kind).toBe("ref");
    const secondIf = bound.functions[0].body.statements[3];
    expect(secondIf.kind).toBe("if");
    if (secondIf.kind !== "if") {
      return;
    }
    expect(secondIf.condition.kind).toBe("compare");
  });

  test("binds int pointer parameters and calls", () => {
    const source = "int second(int *p){ return p[1]; }\nint main(){ int x = 65; int y = 66; return second(&x); }\n";
    const parsed = parseProgram(source, "pointer-param.c");
    const bound = analyzeProgram(parsed, source, "pointer-param.c");
    expect(bound.functions[0].params[0]?.type).toEqual({ kind: "pointer", pointee: "int", width: 2 });
    const calleeReturn = bound.functions[0].body.statements[0];
    expect(calleeReturn.kind).toBe("return");
    if (calleeReturn.kind !== "return" || calleeReturn.expr.kind !== "deref") {
      return;
    }
    expect(calleeReturn.expr.pointer.kind).toBe("pointerAdd");
    const mainReturn = bound.functions[1].body.statements[2];
    expect(mainReturn.kind).toBe("return");
    if (mainReturn.kind !== "return" || mainReturn.expr.kind !== "call") {
      return;
    }
    expect(mainReturn.expr.args[0]?.kind).toBe("localAddress");
  });

  test("binds opaque struct and union pointer params for compare and truthiness", () => {
    const source = "int check(struct Foo *p, union Bar *q){ if (p) return q != 0; return p == 0; }\n";
    const parsed = parseProgram(source, "aggregate-pointer.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer.c");
    expect(bound.functions[0].params[0]?.type).toEqual({
      kind: "pointer",
      pointee: { kind: "aggregate", aggregateKind: "struct", name: "Foo" },
      width: 2,
    });
    expect(bound.functions[0].params[1]?.type).toEqual({
      kind: "pointer",
      pointee: { kind: "aggregate", aggregateKind: "union", name: "Bar" },
      width: 2,
    });
    expect(bound.functions[0].body.statements[0]?.kind).toBe("if");
  });

  test("folds sizeof aggregate types into integer constants", () => {
    const source = "struct Foo { char a; int b; };\nunion Bar { char a; int b; };\nint main(){ return sizeof(struct Foo) + sizeof(union Bar); }\n";
    const parsed = parseProgram(source, "aggregate-sizeof.c");
    const bound = analyzeProgram(parsed, source, "aggregate-sizeof.c");
    const returnStmt = bound.functions[0].body.statements[0];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left).toEqual({ kind: "const", value: 3, type: { kind: "scalar", name: "int", width: 2 } });
    expect(returnStmt.expr.right).toEqual({ kind: "const", value: 2, type: { kind: "scalar", name: "int", width: 2 } });
  });

  test("binds local aggregate objects for sizeof locals and address-of calls", () => {
    const source = "struct Foo { char a; int b; };\nint take(struct Foo *p){ return p != 0; }\nint main(){ struct Foo x; return sizeof x + take(&x); }\n";
    const parsed = parseProgram(source, "aggregate-local.c");
    const bound = analyzeProgram(parsed, source, "aggregate-local.c");
    expect(bound.functions[1].locals[0]).toEqual({
      kind: "local",
      name: "x",
      type: { kind: "aggregate", aggregateKind: "struct", name: "Foo", size: 3 },
      storageBytes: 3,
      slot: 0,
    });
    const returnStmt = bound.functions[1].body.statements[0];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left).toEqual({ kind: "const", value: 3, type: { kind: "scalar", name: "int", width: 2 } });
    expect(returnStmt.expr.right.kind).toBe("call");
    if (returnStmt.expr.right.kind !== "call") {
      return;
    }
    expect(returnStmt.expr.right.args[0]).toEqual({
      kind: "localAddress",
      symbol: bound.functions[1].locals[0],
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "struct", name: "Foo" }, width: 2 },
    });
  });

  test("binds local aggregate pointers initialized from aggregate object addresses", () => {
    const source = "struct Foo { char a; int b; };\nint take(struct Foo *p){ return p != 0; }\nint main(){ struct Foo x; struct Foo *p = &x; return take(p) + (p != 0); }\n";
    const parsed = parseProgram(source, "aggregate-local-pointer.c");
    const bound = analyzeProgram(parsed, source, "aggregate-local-pointer.c");
    expect(bound.functions[1].locals[1]).toEqual({
      kind: "local",
      name: "p",
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "struct", name: "Foo" }, width: 2 },
      storageBytes: 2,
      slot: 1,
    });
    const returnStmt = bound.functions[1].body.statements[1];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("call");
    expect(returnStmt.expr.right.kind).toBe("compare");
  });

  test("binds local union pointers initialized from union object addresses", () => {
    const source = "union Bar { char a; int b; };\nint take(union Bar *p){ return p != 0; }\nint main(){ union Bar x; union Bar *p = &x; return take(p) + (p != 0); }\n";
    const parsed = parseProgram(source, "union-local-pointer.c");
    const bound = analyzeProgram(parsed, source, "union-local-pointer.c");
    expect(bound.functions[1].locals[0]).toEqual({
      kind: "local",
      name: "x",
      type: { kind: "aggregate", aggregateKind: "union", name: "Bar", size: 2 },
      storageBytes: 2,
      slot: 0,
    });
    expect(bound.functions[1].locals[1]).toEqual({
      kind: "local",
      name: "p",
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "union", name: "Bar" }, width: 2 },
      storageBytes: 2,
      slot: 1,
    });
    const returnStmt = bound.functions[1].body.statements[1];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left.kind).toBe("call");
    expect(returnStmt.expr.right.kind).toBe("compare");
  });

  test("binds aggregate pointer assignment after declaration", () => {
    const source = "struct Foo { char a; int b; };\nint take(struct Foo *p){ return p != 0; }\nint main(){ struct Foo x; struct Foo *p; p = &x; return take(p) + (p != 0); }\n";
    const parsed = parseProgram(source, "aggregate-pointer-assign.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer-assign.c");
    const assignStmt = bound.functions[1].body.statements[0];
    expect(assignStmt.kind).toBe("assign");
    if (assignStmt.kind !== "assign") {
      return;
    }
    expect(assignStmt.local).toEqual(bound.functions[1].locals[1]);
    expect(assignStmt.expr).toEqual({
      kind: "localAddress",
      symbol: bound.functions[1].locals[0],
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "struct", name: "Foo" }, width: 2 },
    });
    const returnStmt = bound.functions[1].body.statements[1];
    expect(returnStmt.kind).toBe("return");
  });

  test("binds union pointer assignment after declaration", () => {
    const source = "union Bar { char a; int b; };\nint take(union Bar *p){ return p != 0; }\nint main(){ union Bar x; union Bar *p; p = &x; return take(p) + (p != 0); }\n";
    const parsed = parseProgram(source, "union-pointer-assign.c");
    const bound = analyzeProgram(parsed, source, "union-pointer-assign.c");
    const assignStmt = bound.functions[1].body.statements[0];
    expect(assignStmt.kind).toBe("assign");
    if (assignStmt.kind !== "assign") {
      return;
    }
    expect(assignStmt.local).toEqual(bound.functions[1].locals[1]);
    expect(assignStmt.expr).toEqual({
      kind: "localAddress",
      symbol: bound.functions[1].locals[0],
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "union", name: "Bar" }, width: 2 },
    });
    const returnStmt = bound.functions[1].body.statements[1];
    expect(returnStmt.kind).toBe("return");
  });

  test("binds aggregate pointer null assignment and reassignment", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ struct Foo x; struct Foo *p; p = 0; p = &x; if (p) return p != 0; return 0; }\n";
    const parsed = parseProgram(source, "aggregate-pointer-null.c");
    const bound = analyzeProgram(parsed, source, "aggregate-pointer-null.c");
    const firstAssign = bound.functions[0].body.statements[0];
    expect(firstAssign.kind).toBe("assign");
    if (firstAssign.kind !== "assign") {
      return;
    }
    expect(firstAssign.local).toEqual(bound.functions[0].locals[1]);
    expect(firstAssign.expr).toEqual({ kind: "const", value: 0, type: { kind: "scalar", name: "int", width: 2 } });
    const secondAssign = bound.functions[0].body.statements[1];
    expect(secondAssign.kind).toBe("assign");
    if (secondAssign.kind !== "assign") {
      return;
    }
    expect(secondAssign.expr).toEqual({
      kind: "localAddress",
      symbol: bound.functions[0].locals[0],
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "struct", name: "Foo" }, width: 2 },
    });
    const ifStmt = bound.functions[0].body.statements[2];
    expect(ifStmt.kind).toBe("if");
  });

  test("binds union pointer null assignment and reassignment", () => {
    const source = "union Bar { char a; int b; };\nint main(){ union Bar x; union Bar *p; p = 0; p = &x; if (p) return p != 0; return 0; }\n";
    const parsed = parseProgram(source, "union-pointer-null.c");
    const bound = analyzeProgram(parsed, source, "union-pointer-null.c");
    const firstAssign = bound.functions[0].body.statements[0];
    expect(firstAssign.kind).toBe("assign");
    if (firstAssign.kind !== "assign") {
      return;
    }
    expect(firstAssign.local).toEqual(bound.functions[0].locals[1]);
    expect(firstAssign.expr).toEqual({ kind: "const", value: 0, type: { kind: "scalar", name: "int", width: 2 } });
    const secondAssign = bound.functions[0].body.statements[1];
    expect(secondAssign.kind).toBe("assign");
    if (secondAssign.kind !== "assign") {
      return;
    }
    expect(secondAssign.expr).toEqual({
      kind: "localAddress",
      symbol: bound.functions[0].locals[0],
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "union", name: "Bar" }, width: 2 },
    });
    const ifStmt = bound.functions[0].body.statements[2];
    expect(ifStmt.kind).toBe("if");
  });

  test("binds direct aggregate address compares and truthiness", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ struct Foo x; if (&x) return &x != 0; return 0; }\n";
    const parsed = parseProgram(source, "aggregate-address-direct.c");
    const bound = analyzeProgram(parsed, source, "aggregate-address-direct.c");
    const ifStmt = bound.functions[0].body.statements[0];
    expect(ifStmt.kind).toBe("if");
    if (ifStmt.kind !== "if") {
      return;
    }
    expect(ifStmt.condition).toEqual({
      kind: "localAddress",
      symbol: bound.functions[0].locals[0],
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "struct", name: "Foo" }, width: 2 },
    });
    const thenReturn = ifStmt.thenBlock.statements[0];
    expect(thenReturn?.kind).toBe("return");
  });

  test("binds direct union address compares and truthiness", () => {
    const source = "union Bar { char a; int b; };\nint main(){ union Bar x; if (&x) return &x != 0; return 0; }\n";
    const parsed = parseProgram(source, "union-address-direct.c");
    const bound = analyzeProgram(parsed, source, "union-address-direct.c");
    const ifStmt = bound.functions[0].body.statements[0];
    expect(ifStmt.kind).toBe("if");
    if (ifStmt.kind !== "if") {
      return;
    }
    expect(ifStmt.condition).toEqual({
      kind: "localAddress",
      symbol: bound.functions[0].locals[0],
      type: { kind: "pointer", pointee: { kind: "aggregate", aggregateKind: "union", name: "Bar" }, width: 2 },
    });
    const thenReturn = ifStmt.thenBlock.statements[0];
    expect(thenReturn?.kind).toBe("return");
  });

  test("binds mixed aggregate sizeof and direct address compare expressions", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ struct Foo x; return sizeof x + (&x != 0); }\n";
    const parsed = parseProgram(source, "aggregate-mixed-expr.c");
    const bound = analyzeProgram(parsed, source, "aggregate-mixed-expr.c");
    const returnStmt = bound.functions[0].body.statements[0];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left).toEqual({ kind: "const", value: 3, type: { kind: "scalar", name: "int", width: 2 } });
    expect(returnStmt.expr.right.kind).toBe("compare");
  });

  test("binds mixed union sizeof and direct address conditional expressions", () => {
    const source = "union Bar { char a; int b; };\nint main(){ union Bar x; return sizeof x + (&x ? 1 : 0); }\n";
    const parsed = parseProgram(source, "union-mixed-expr.c");
    const bound = analyzeProgram(parsed, source, "union-mixed-expr.c");
    const returnStmt = bound.functions[0].body.statements[0];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "additive") {
      return;
    }
    expect(returnStmt.expr.left).toEqual({ kind: "const", value: 2, type: { kind: "scalar", name: "int", width: 2 } });
    expect(returnStmt.expr.right.kind).toBe("conditional");
  });

  test("rejects aggregate pointer-to-pointer declarations during parse/analyze flow", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ struct Foo **pp; return 0; }\n";
    expect(() => {
      const parsed = parseProgram(source, "aggregate-pointer-pointer.c");
      analyzeProgram(parsed, source, "aggregate-pointer-pointer.c");
    }).toThrow(/does not support/);
  });

  test("rejects union pointer-to-pointer declarations during parse/analyze flow", () => {
    const source = "union Bar { char a; int b; };\nint main(){ union Bar **pp; return 0; }\n";
    expect(() => {
      const parsed = parseProgram(source, "union-pointer-pointer.c");
      analyzeProgram(parsed, source, "union-pointer-pointer.c");
    }).toThrow(/does not support/);
  });

  test("rejects address-of applied to address-of expressions during parse/analyze flow", () => {
    const source = "struct Foo { char a; int b; };\nint main(){ struct Foo x; return &(&x) != 0; }\n";
    expect(() => {
      const parsed = parseProgram(source, "aggregate-double-address.c");
      analyzeProgram(parsed, source, "aggregate-double-address.c");
    }).toThrow(/only supports address-of on locals, array elements, or dereference/);
  });

  test("rejects local shadowing a parameter", () => {
    const source = "int main(int a){ if (a > 0) { int a = 1; return a; } return 0; }\n";
    const parsed = parseProgram(source, "shadow.c");
    expect(() => analyzeProgram(parsed, source, "shadow.c")).toThrow(/shadowing a parameter/);
  });

  test("binds local char arrays as addressable storage and constant index reads", () => {
    const source = "int main(){ char buf[16]; outchar(buf); return buf[2]; }\n";
    const parsed = parseProgram(source, "array.c");
    const bound = analyzeProgram(parsed, source, "array.c");
    const body = bound.functions[0].body;

    expect(bound.functions[0].locals[0]?.storageBytes).toBe(16);
    expect(body.statements[0]?.kind).toBe("expr");
    if (body.statements[0]?.kind !== "expr" || body.statements[0].expr.kind !== "call") {
      return;
    }
    expect(body.statements[0].expr.args[0]?.kind).toBe("localAddress");
    expect(body.statements[1]?.kind).toBe("return");
    if (body.statements[1]?.kind !== "return") {
      return;
    }
    expect(body.statements[1].expr.kind).toBe("localArrayElement");
  });

  test("binds local char array constant index assignments", () => {
    const source = "int main(){ char buf[4]; buf[2] = 65; return buf[2]; }\n";
    const parsed = parseProgram(source, "array-assign.c");
    const bound = analyzeProgram(parsed, source, "array-assign.c");
    const stmt = bound.functions[0].body.statements[0];
    expect(stmt.kind).toBe("arrayAssign");
    if (stmt.kind !== "arrayAssign") {
      return;
    }
    expect(stmt.target.kind).toBe("local");
    expect(stmt.target.type).toEqual({ kind: "array", elementType: "char", length: 4 });
    expect(stmt.index).toEqual({ kind: "const", value: 2, type: { kind: "scalar", name: "int", width: 2 } });
  });

  test("rejects out-of-bounds local char array assignments", () => {
    const source = "int main(){ char buf[4]; buf[4] = 65; return 0; }\n";
    const parsed = parseProgram(source, "array-assign-oob.c");
    expect(() => analyzeProgram(parsed, source, "array-assign-oob.c")).toThrow(/out of bounds/);
  });

  test("binds local char array dynamic index reads and assignments", () => {
    const source = "int main(){ int i = 1; char buf[4]; buf[i + 1] = 65; return buf[i]; }\n";
    const parsed = parseProgram(source, "array-dynamic.c");
    const bound = analyzeProgram(parsed, source, "array-dynamic.c");
    const assignStmt = bound.functions[0].body.statements[1];
    expect(assignStmt.kind).toBe("arrayAssign");
    if (assignStmt.kind !== "arrayAssign") {
      return;
    }
    expect(assignStmt.index.kind).toBe("additive");
    const returnStmt = bound.functions[0].body.statements[2];
    expect(returnStmt.kind).toBe("return");
    if (returnStmt.kind !== "return" || returnStmt.expr.kind !== "localArrayElement") {
      return;
    }
    expect(returnStmt.expr.index.kind).toBe("ref");
  });

  test("binds increment and decrement simple statements through existing assignment forms", () => {
    const source = "int main(){ int i = 0; char buf[4]; i++; buf[i]--; return i; }\n";
    const parsed = parseProgram(source, "inc-dec.c");
    const bound = analyzeProgram(parsed, source, "inc-dec.c");
    const incStmt = bound.functions[0].body.statements[1];
    expect(incStmt.kind).toBe("assign");
    if (incStmt.kind !== "assign" || incStmt.expr.kind !== "additive") {
      return;
    }
    expect(incStmt.expr.op).toBe("+");
    const decStmt = bound.functions[0].body.statements[2];
    expect(decStmt.kind).toBe("arrayAssign");
    if (decStmt.kind !== "arrayAssign" || decStmt.expr.kind !== "additive") {
      return;
    }
    expect(decStmt.expr.op).toBe("-");
  });

  test("binds prefix increment and decrement simple statements through existing assignment forms", () => {
    const source = "int main(){ int i = 0; char buf[4]; ++i; --buf[i]; return i; }\n";
    const parsed = parseProgram(source, "prefix-inc-dec.c");
    const bound = analyzeProgram(parsed, source, "prefix-inc-dec.c");
    const incStmt = bound.functions[0].body.statements[1];
    expect(incStmt.kind).toBe("assign");
    if (incStmt.kind !== "assign" || incStmt.expr.kind !== "additive") {
      return;
    }
    expect(incStmt.expr.op).toBe("+");
    const decStmt = bound.functions[0].body.statements[2];
    expect(decStmt.kind).toBe("arrayAssign");
    if (decStmt.kind !== "arrayAssign" || decStmt.expr.kind !== "additive") {
      return;
    }
    expect(decStmt.expr.op).toBe("-");
  });

  test("binds compound assignment simple statements through existing assignment forms", () => {
    const source = "int main(){ int i = 1; char buf[4]; i += 2; buf[i] -= 3; return i; }\n";
    const parsed = parseProgram(source, "compound-assign.c");
    const bound = analyzeProgram(parsed, source, "compound-assign.c");
    const addStmt = bound.functions[0].body.statements[1];
    expect(addStmt.kind).toBe("assign");
    if (addStmt.kind !== "assign" || addStmt.expr.kind !== "additive") {
      return;
    }
    expect(addStmt.expr.op).toBe("+");
    const subStmt = bound.functions[0].body.statements[2];
    expect(subStmt.kind).toBe("arrayAssign");
    if (subStmt.kind !== "arrayAssign" || subStmt.expr.kind !== "additive") {
      return;
    }
    expect(subStmt.expr.op).toBe("-");
  });

  test("binds wider compound assignment operators through existing assignment forms", () => {
    const source = "int main(){ int x = 3; char buf[4]; x <<= 1; buf[0] |= 2; x *= 4; return x; }\n";
    const parsed = parseProgram(source, "compound-ops.c");
    const bound = analyzeProgram(parsed, source, "compound-ops.c");
    const shiftStmt = bound.functions[0].body.statements[1];
    expect(shiftStmt.kind).toBe("assign");
    if (shiftStmt.kind !== "assign" || shiftStmt.expr.kind !== "shift") {
      return;
    }
    expect(shiftStmt.expr.op).toBe("<<");
    const orStmt = bound.functions[0].body.statements[2];
    expect(orStmt.kind).toBe("arrayAssign");
    if (orStmt.kind !== "arrayAssign" || orStmt.expr.kind !== "bitwise") {
      return;
    }
    expect(orStmt.expr.op).toBe("|");
    const mulStmt = bound.functions[0].body.statements[3];
    expect(mulStmt.kind).toBe("assign");
    if (mulStmt.kind !== "assign" || mulStmt.expr.kind !== "multiplicative") {
      return;
    }
    expect(mulStmt.expr.op).toBe("*");
  });

  test("allows break inside switch bodies", () => {
    const source = "int main(int x){ switch (x) { case 1: break; default: return 0; } return 1; }\n";
    const parsed = parseProgram(source, "switch.c");
    const bound = analyzeProgram(parsed, source, "switch.c");
    expect(bound.functions[0].body.statements[0]?.kind).toBe("switch");
  });

  test("allows continue inside do-while loop bodies", () => {
    const source = "int main(){ int x = 0; do { x = x + 1; continue; } while (x < 2); return x; }\n";
    const parsed = parseProgram(source, "do-while.c");
    const bound = analyzeProgram(parsed, source, "do-while.c");
    expect(bound.functions[0].body.statements[1]?.kind).toBe("doWhile");
  });

  test("rejects control-flow nesting deeper than the compiler limit", () => {
    const source = "int main(){ if (1) if (1) if (1) if (1) if (1) if (1) if (1) if (1) if (1) return 1; return 0; }\n";
    const parsed = parseProgram(source, "nest.c");
    expect(() => analyzeProgram(parsed, source, "nest.c")).toThrow(/nesting up to 8 levels/);
  });
});

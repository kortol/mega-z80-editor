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

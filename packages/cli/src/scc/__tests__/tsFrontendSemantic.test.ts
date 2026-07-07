import { TsFrontendError } from "../tsFrontendDiagnostics";
import { parseProgram } from "../tsFrontendParser";
import { analyzeProgram } from "../tsFrontendSemantic";

describe("tsFrontendSemantic", () => {
  test("rejects duplicate function names", () => {
    const source = "int main(){ return 1; }\nint main(){ return 2; }\n";
    const parsed = parseProgram(source, "dup.c");
    expect(() => analyzeProgram(parsed, source, "dup.c")).toThrow(TsFrontendError);
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
    expect(stmt.local.type).toEqual({ kind: "array", elementType: "char", length: 4 });
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

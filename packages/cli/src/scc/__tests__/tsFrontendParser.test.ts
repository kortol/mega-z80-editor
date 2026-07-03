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
});

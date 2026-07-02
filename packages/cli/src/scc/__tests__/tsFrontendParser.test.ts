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
});

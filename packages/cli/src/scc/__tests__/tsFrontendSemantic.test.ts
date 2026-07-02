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
});

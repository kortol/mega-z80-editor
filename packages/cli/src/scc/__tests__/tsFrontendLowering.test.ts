import { parseProgram } from "../tsFrontendParser";
import { analyzeProgram } from "../tsFrontendSemantic";
import { lowerSourceProgram } from "../tsFrontendLowering";

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
});

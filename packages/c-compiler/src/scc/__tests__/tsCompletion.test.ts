import { parseProgram } from "../tsFrontendParser";
import { analyzeProgram } from "../tsFrontendSemantic";
import { lowerSourceProgram } from "../tsFrontendLowering";

describe("C Subset completion", () => {
  test.each([
    ["struct S{int a;}; int main(){struct S s={.missing=1};return 0;}", "designator"],
    ["int main(){int a[2]={[2]=1};return 0;}", "designator"],
    ["int main(){int a[2]={1,2,3};return 0;}", "does not fit"],
    ["struct S{int a;}; int main(){struct S a;struct S b;return a==b;}", "aggregate"],
    ["struct S{int a;}; int main(){struct S a;if(a){return 1;}return 0;}", "aggregate"],
  ])("diagnoses invalid initializer/aggregate use: %s", (source, diagnostic) => {
    expect(() => analyzeProgram(parseProgram(source, "negative.c"), source, "negative.c")).toThrow(diagnostic);
  });

  test.each([
    "int main(){return 1.25;}",
    "int main(){return ({int x=1;x;});}",
    "int main(){return _Generic(1,int:1);}",
    "int main(){typeof(1) x;return 0;}",
  ])("keeps excluded expression/type forms diagnosed: %s", (source) => {
    expect(() => analyzeProgram(parseProgram(source, "excluded.c"), source, "excluded.c")).toThrow();
  });
  test.each([
    ["int main(){ goto missing; return 0; }", "Undefined label"],
    ["int main(){ same: return 0; same: return 1; }", "Duplicate label"],
    ["int other(){ label: return 0; } int main(){ goto label; return 0; }", "Undefined label"],
  ])("diagnoses invalid function labels: %s", (source, diagnostic) => {
    expect(() => analyzeProgram(parseProgram(source, "labels.c"), source, "labels.c")).toThrow(diagnostic);
  });

  test("lowers chained labels, forward/backward jumps and block exits", () => {
    const source = "int main(){ int n=2; goto start; again: n--; start: alias: if(n){ goto again; } { int x=3; goto done; } done: return n; }";
    const bound = analyzeProgram(parseProgram(source, "labels.c"), source, "labels.c");
    expect(() => lowerSourceProgram(bound, "labels.i", source, "labels.c")).not.toThrow();
  });
});

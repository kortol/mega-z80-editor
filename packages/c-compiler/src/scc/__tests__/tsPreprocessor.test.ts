import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getBundledRuntimeDefines, getBundledRuntimeIncludeDir } from "../runtime";
import { preprocessTsCSource } from "../tsPreprocessor";

describe("TypeScript SCC preprocessor", () => {
  test("supports guarded recursive includes and macro include names", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-guard-"));
    fs.writeFileSync(path.join(dir, "guard.h"), '#ifndef GUARD\n#define GUARD\n#include "guard.h"\n#define VALUE 65\n#endif');
    const result = preprocessTsCSource('#define HEADER "guard.h"\n#include HEADER\nVALUE', path.join(dir, 'test.c'));
    expect(result.sourceText.trim()).toBe('65');
  });

  test("stringifies original token spacing and accepts empty pasted arguments", () => {
    const result = preprocessTsCSource('#define S(x) #x\n#define CAT(a,b) a ## b\nS(a+b) S(a  + b) CAT(,x) CAT(,)','test.c');
    expect(result.sourceText.trim()).toBe('"a+b" "a + b" x');
  });

  test.each([
    ['#define M(a,a) a', 'parameters'],
    ['#define M(a) a\nM(1,2)', 'expects 1 arguments'],
    ['#define M(a) a\nM(', 'Unterminated'],
    ['#if 1/0\n#endif', 'Division by zero'],
    ['#if 1\n#else\n#elif 1\n#endif', 'invalid #elif'],
    ['#if 1', 'missing #endif'],
  ])("diagnoses malformed preprocessing: %s", (source, diagnostic) => {
    expect(() => preprocessTsCSource(source, 'test.c')).toThrow(diagnostic);
  });
  test("selects bundled header declarations from runtime defines", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mz80-cpp-")), "main.c");
    const result = preprocessTsCSource("#include <stdio.h>\n#ifdef MZ80_RUNTIME_FULL\nint full;\n#else\nint lite;\n#endif", file, {
      defines: getBundledRuntimeDefines({ platform: "cpm", profile: "full" }),
      bundledIncludeDirs: [getBundledRuntimeIncludeDir()],
    });
    expect(result.sourceText).toContain("int full;");
    expect(result.sourceText).not.toContain("int lite;");
    expect(result.runtimeVariadicNames).toEqual(new Set(["printf", "sprintf"]));
  });

  test("rejects a user attempt to override a configured platform define", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mz80-cpp-")), "main.c");
    expect(() => preprocessTsCSource("#define MZ80_PLATFORM_CPM 0", file, {
      defines: getBundledRuntimeDefines({ platform: "cpm", profile: "lite" }),
    })).toThrow("cannot override configured define");
  });

  test("expands only the bundled assert function-like macro with balanced arguments", () => {
    const file = path.join(__dirname, "fixture.c");
    const result = preprocessTsCSource("#include <assert.h>\nassert(a && (b || c));", file, {
      defines: getBundledRuntimeDefines({ platform: "cpm", profile: "full" }),
      bundledIncludeDirs: [getBundledRuntimeIncludeDir()],
    });
    expect(result.sourceText).toContain("__mz80_assert ( a && ( b || c ) );");
  });

  test("expands nested function macros and preserves literals", () => {
    const file = path.join(__dirname, "fixture.c");
    const result = preprocessTsCSource('#define VALUE BASE\n#define BASE 3\n#define twice(x) ((x)+(x))\ntwice(VALUE); "VALUE twice(x)"; \'V\';', file);
    expect(result.sourceText).toContain('((3)+(3))'.replace(/(.)/g, '$1 ').trim());
    expect(result.sourceText).toContain('"VALUE twice(x)"');
  });

  test("supports conditional precedence, elif and unevaluated branches", () => {
    const result = preprocessTsCSource('#define N 3\n#if defined(N) && N * 2 == 6 && (1 || 1/0)\nOK\n#elif 1/0\nBAD\n#else\nBAD\n#endif\n#if 0\n#if garbage(\nBAD\n#endif\n#endif', 'test.c');
    expect(result.sourceText).toContain('OK');
    expect(result.sourceText).not.toContain('BAD');
  });

  test("supports comments, token paste, stringification, recursion suppression and undef", () => {
    const result = preprocessTsCSource('#define N 2\n#define N2 N\n#define CAT(a,b) a ## b\n#define STR(a) #a\n#define SELF SELF\nCAT(N,2) STR(hello world) SELF /* N */ "N"\n#undef N\nN', 'test.c');
    expect(result.sourceText).toContain('2 "hello world" SELF');
    expect(result.sourceText.trim().endsWith('N')).toBe(true);
  });
});

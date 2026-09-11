import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getBundledRuntimeDefines, getBundledRuntimeIncludeDir } from "../runtime";
import { preprocessTsCSource } from "../tsPreprocessor";

describe("TypeScript SCC preprocessor", () => {
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
    expect(result.sourceText).toContain("__mz80_assert(a && (b || c));");
  });

  test("rejects arbitrary function-like macros", () => {
    const file = path.join(__dirname, "fixture.c");
    expect(() => preprocessTsCSource("#define twice(x) ((x)+(x))", file)).toThrow("no function-like #define other than bundled assert");
  });
});

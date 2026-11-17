import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger, link, Z80DebugCore } from "@mz80/core";
import { compileSccProgram } from "../compileProgram";
import { TsSccCompilerAdapter } from "../tsCompilerAdapter";
import { NumericFeature, normalizeNumericFeatures } from "../runtimeFeatures";
import { getBundledRuntimeArtifacts } from "../runtimeArtifacts";
import { getBundledRuntimeDefines, getBundledRuntimeIncludeDirs, getBundledSccRuntime } from "../runtime";
import { translateSccAsm } from "../translateAsm";
import { assemble } from "@mz80/assembler";

function run(source: string, features: NumericFeature[], abi: "ts-internal" | "ts-static-frame", profile: "lite" | "full", sourceRuntime = false) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-numeric-"));
  const inputFile = path.join(tempDir, "numeric.c");
  const outputFile = path.join(tempDir, "numeric.com");
  fs.writeFileSync(inputFile, source);
  const runtimeObject = sourceRuntime ? path.join(tempDir, "runtime.rel") : undefined;
  if (runtimeObject) {
    const assemblyFile = path.join(tempDir, "runtime.asm");
    fs.writeFileSync(assemblyFile, translateSccAsm(getBundledSccRuntime({ platform: "cpm", profile, features }), { moduleName: "numeric_source_runtime" }));
    const context = assemble(createLogger("quiet"), assemblyFile, runtimeObject, { relVersion: 2 });
    expect(context.errors).toEqual([]);
  }
  if (runtimeObject) {
    const runtime = { platform: "cpm" as const, profile, features };
    const compiled = new TsSccCompilerAdapter({ abi }).compileToRel(createLogger("quiet"), {
      inputFile, tempDir, bundledIncludeDirs: getBundledRuntimeIncludeDirs(runtime),
      defines: getBundledRuntimeDefines(runtime), runtimeFeatures: features,
    });
    link([runtimeObject, compiled.relFile], outputFile, { com: true, orgText: "100H", map: true });
  } else {
    compileSccProgram(createLogger("quiet"), {
      inputFile, outputFile, tempDir, runtime: { platform: "cpm", profile, features }, com: true, map: true,
    }, { compilerAdapter: new TsSccCompilerAdapter({ abi }) });
  }
  const core = new Z80DebugCore(false);
  core.setCpm22Enabled(true); core.setAllowOutOfImage(true);
  core.loadImage(fs.readFileSync(outputFile), 0x100); core.setEntry(0x100);
  expect(core.run(2000000).reason).toBe("BDOS 0: terminate");
  return { core, map: fs.readFileSync(path.join(tempDir, "numeric.map"), "utf8"), imageBytes: fs.statSync(outputFile).size };
}

const configurations = (["ts-internal", "ts-static-frame"] as const).flatMap((abi) =>
  (["lite", "full"] as const).flatMap((profile) =>
    ([[], ["fixed"], ["bcd"], ["fixed", "bcd"]] as NumericFeature[][]).map((features) => ({ abi, profile, features }))));
test.each(configurations)("numeric selection %o links only selected providers", ({ abi, profile, features }) => {
  const source = [
    "#include <stdio.h>",
    ...(features.includes("fixed") ? ["#include <mz80_fixed.h>", "mz80_q16_16 fixed;"] : []),
    ...(features.includes("bcd") ? ["#include <mz80_bcd.h>", "mz80_bcd decimal;"] : []),
    "int main(){",
    ...(features.includes("fixed") ? ["putchar(mz80_q16_from_int(&fixed,7)+65);"] : []),
    ...(features.includes("bcd") ? ["putchar(mz80_bcd_from_int(&decimal,-7)+65);"] : []),
    "return 0;}",
  ].join("\n");
  const result = run(source, features, abi, profile);
  expect(result.core.getOutput()).toBe("A".repeat(features.length));
  expect(result.map.includes("MZ80_Q16_V1_FROM_INT")).toBe(features.includes("fixed"));
  expect(result.map.includes("MZ80_BCD_V1_FROM_INT")).toBe(features.includes("bcd"));
});

test.each(["ts-internal", "ts-static-frame"] as const)("constructors match host byte vectors through %s", (abi) => {
  const values = [-32768, -129, -128, -1, 0, 1, 127, 128, 32767];
  const source = ["#include <stdio.h>", "#include <mz80_fixed.h>", "#include <mz80_bcd.h>",
    ...values.flatMap((_, i) => [`mz80_q8_8 small${i}={{81,82}};`, `mz80_q16_16 wide${i};`, `mz80_bcd decimal${i};`]),
    "int main(){",
    ...values.flatMap((value, i) => [`putchar(mz80_q8_from_int(&small${i},${value})+65);`, `putchar(mz80_q16_from_int(&wide${i},${value})+65);`, `putchar(mz80_bcd_from_int(&decimal${i},${value})+65);`]),
    "putchar(mz80_q8_from_int(NULL,1)+65);putchar(mz80_q16_from_int(NULL,1)+65);putchar(mz80_bcd_from_int(NULL,1)+65);putchar(sizeof(mz80_q8_8)+63);putchar(sizeof(mz80_q16_16)+61);putchar(sizeof(mz80_bcd)+56);return 0;}",
  ].join("\n").replace("#include <stdio.h>", "#include <stdio.h>\n#include <stddef.h>");
  const { core, map } = run(source, ["fixed", "bcd"], abi, "lite");
  const bytes = (name: string, size: number) => {
    const match = new RegExp(`^${name.toUpperCase()}\\s*= \\$([0-9A-Fa-f]+)`, "m").exec(map);
    expect(match).not.toBeNull();
    return core.readMemory(parseInt(match![1], 16), size);
  };
  values.forEach((value, i) => {
    const small = value < -128 || value > 127 ? [81, 82] : [0, value & 255];
    expect(bytes(`small${i}`, 2)).toEqual(small);
    const wide = Buffer.alloc(4); wide.writeInt32LE(value * 65536);
    expect(bytes(`wide${i}`, 4)).toEqual([...wide]);
    const digits = Math.abs(value).toString().padStart(12, "0") + "0000";
    const bcd = [value < 0 ? 1 : 0, ...Array.from({ length: 8 }, (_, j) => parseInt(digits.slice(j * 2, j * 2 + 2), 16))];
    expect(bytes(`decimal${i}`, 9)).toEqual(bcd);
  });
  expect(core.getOutput()).toBe(values.map((v) => (v < -128 || v > 127 ? "B" : "A") + "AA").join("") + "DDDAAA");
});

test("selection validation and disabled provider diagnostics", () => {
  expect(normalizeNumericFeatures(["bcd", "fixed", "bcd"])).toEqual(["fixed", "bcd"]);
  expect(() => normalizeNumericFeatures(["unknown"])).toThrow("features");
  expect(getBundledRuntimeDefines({ platform: "cpm", profile: "full" })).not.toHaveProperty("MZ80_FEATURE_FIXED");
  expect(getBundledRuntimeArtifacts({ platform: "cpm", profile: "lite", features: ["bcd"] }).libraryPaths.map((file) => path.basename(file))).toEqual(["libmz80-bcd-v1.lib"]);
  expect(() => run("int mz80_q16_v1_from_int(char *out,int v);char x[4];int main(){return mz80_q16_v1_from_int(x,1);}", [], "ts-internal", "lite")).toThrow("must be selected");
  expect(() => run("#include <mz80_fixed.h>\nint main(){return 0;}", [], "ts-internal", "lite")).toThrow();
});

test("selected but unused numeric archives add no code or mutable storage", () => {
  const baseline = run("int main(){return 0;}", [], "ts-internal", "lite");
  const enabled = run("#include <mz80_fixed.h>\n#include <mz80_bcd.h>\nint main(){return 0;}", ["fixed", "bcd"], "ts-internal", "lite");
  expect(enabled.imageBytes).toBe(baseline.imageBytes);
  expect(enabled.map).not.toMatch(/MZ80_Q8|MZ80_Q16|MZ80_BCD/);
});

test.each(["lite", "full"] as const)("source runtime concatenation executes numeric constructors with %s", (profile) => {
  const result = run("#include <stdio.h>\n#include <mz80_fixed.h>\n#include <mz80_bcd.h>\nmz80_q16_16 wide;mz80_bcd decimal;int main(){putchar(mz80_q16_from_int(&wide,7)+65);putchar(mz80_bcd_from_int(&decimal,-7)+65);return 0;}", ["fixed", "bcd"], "ts-internal", profile, true);
  expect(result.core.getOutput()).toBe("AA");
});

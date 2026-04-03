import path from "path";
import { runPegFile } from "./compareParsers";

const repoRoot = path.resolve(__dirname, "../../../../..");

const files = [
  "packages/cli/sub2.inc",
  "packages/cli/sub1.inc",
  "examples/p1-c/p1c_fixture.asm",
  "examples/z80test/src/z80memptr.asm",
  "examples/z80test/src/z80full.asm",
  "examples/z80test/src/z80flags.asm",
  "examples/z80test/src/z80docflags.asm",
  "examples/z80test/src/z80doc.asm",
  "examples/z80test/src/z80ccfscr.asm",
  "examples/z80test/src/z80ccf.asm",
  "examples/z80test/src/tests.asm",
  "examples/z80test/src/testmacros.asm",
  "examples/z80test/src/print.asm",
  "examples/z80test/src/main.asm",
  "examples/z80test/src/idea.asm",
  "examples/z80test/src/crctab.asm",
  "examples/p1-d/fixture-p1d.asm",
  "packages/cli/main.asm",
  "examples/hello-msx/src/main.asm",
  "packages/cli/examples/linktest/test_sections.asm",
  "packages/cli/examples/linktest/test.asm",
  "examples/hello/src/hello.asm",
  "examples/hello/src/bdos.asm",
  "packages/cli/src/assembler-old/__tests__/mac.inc",
  "packages/cli/src/assembler/examples/sample.asm",
];

describe("PEG parser (real files)", () => {
  test("debug p1c peg", () => {
    const input = path.join(repoRoot, "examples/p1-c/p1c_fixture.asm");
    const res = runPegFile("p1c", input, { relVersion: 2 });
    console.log("debug p1c peg errors", res.errors);
    console.log("debug p1c peg warnings", res.warnings);
    expect(res.errors).toEqual([]);
  });

  for (const rel of files) {
    const name = rel.replace(/[\\/]/g, "_");
    const full = path.join(repoRoot, rel);
    const shouldSkip = rel.includes("examples/z80test");
    const runner = shouldSkip ? test.skip : test;
    runner(rel, () => {
      const result = runPegFile(name, full, { keepTemp: false, relVersion: 2 });
      expect(result.exception).toBeUndefined();
      expect(result.errors).toEqual([]);
    });
  }
});

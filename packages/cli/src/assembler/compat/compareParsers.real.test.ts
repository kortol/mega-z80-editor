import path from "path";
import { runPegFile } from "./compareParsers";
import { EXAMPLES_REPO_NAME, resolveExamplesPath, resolveExamplesRepoDir } from "../../examplesRepo";

const repoRoot = path.resolve(__dirname, "../../../../..");
const examplesRoot = resolveExamplesRepoDir(repoRoot);

const packageLocalFiles = [
  "packages/cli/examples/include-smoke/sub2.inc",
  "packages/cli/examples/include-smoke/sub1.inc",
  "packages/cli/examples/include-smoke/main.asm",
  "packages/cli/examples/linktest/test_sections.asm",
  "packages/cli/examples/linktest/test.asm",
  "packages/cli/src/assembler/__tests__/mac.inc",
  "packages/cli/src/assembler/examples/sample.asm",
];

const externalFiles = [
  "p1-c/p1c_fixture.asm",
  "z80test/src/z80memptr.asm",
  "z80test/src/z80full.asm",
  "z80test/src/z80flags.asm",
  "z80test/src/z80docflags.asm",
  "z80test/src/z80doc.asm",
  "z80test/src/z80ccfscr.asm",
  "z80test/src/z80ccf.asm",
  "z80test/src/tests.asm",
  "z80test/src/testmacros.asm",
  "z80test/src/print.asm",
  "z80test/src/main.asm",
  "z80test/src/idea.asm",
  "z80test/src/crctab.asm",
  "p1-d/fixture-p1d.asm",
  "hello-msx/src/main.asm",
  "hello/src/hello.asm",
  "hello/src/bdos.asm",
];

const files = [
  ...packageLocalFiles.map((rel) => ({
    label: rel,
    full: path.join(repoRoot, rel),
    shouldSkip: false,
  })),
  ...externalFiles
    .map((rel) => ({
      label: `${EXAMPLES_REPO_NAME}/${rel}`,
      full: resolveExamplesPath(repoRoot, rel),
      shouldSkip: rel.includes("z80test"),
    }))
    .filter((entry): entry is { label: string; full: string; shouldSkip: boolean } => !!entry.full),
];

describe("PEG parser (real files)", () => {
  test("debug p1c peg", () => {
    const input = resolveExamplesPath(repoRoot, "p1-c", "p1c_fixture.asm");
    if (!input) {
      if (!examplesRoot) {
        console.warn(`Skipping p1-c debug fixture because ${EXAMPLES_REPO_NAME} is not available.`);
      }
      return;
    }
    const res = runPegFile("p1c", input, { relVersion: 2 });
    console.log("debug p1c peg errors", res.errors);
    console.log("debug p1c peg warnings", res.warnings);
    expect(res.errors).toEqual([]);
  });

  for (const entry of files) {
    const name = entry.label.replace(/[\\/]/g, "_");
    const full = entry.full;
    const shouldSkip = entry.shouldSkip;
    const runner = shouldSkip ? test.skip : test;
    runner(entry.label, () => {
      const result = runPegFile(name, full, { keepTemp: false, relVersion: 2 });
      expect(result.exception).toBeUndefined();
      expect(result.errors).toEqual([]);
    });
  }
});


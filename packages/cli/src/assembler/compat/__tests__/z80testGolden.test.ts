import fs from "fs";
import path from "path";
import { phaseEmit, getBytes } from "../../../assembler-old/testUtils";

const FIXTURE_DIR = path.resolve(__dirname, "../../../../tests/z80test");

function listAsmFixtures(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(name => name.toLowerCase().endsWith(".asm"))
    .map(name => path.join(dir, name));
}

function loadBinBytes(binPath: string): number[] {
  const buf = fs.readFileSync(binPath);
  return Array.from(buf.values());
}

const asmFiles = listAsmFixtures(FIXTURE_DIR);

if (asmFiles.length === 0) {
  test.skip("z80test golden fixtures (no fixtures found)", () => {});
} else {
  describe("z80test golden fixtures", () => {
    for (const asmPath of asmFiles) {
      const base = path.basename(asmPath, ".asm");
      const binPath = path.join(FIXTURE_DIR, `${base}.bin`);

      test(base, () => {
        if (!fs.existsSync(binPath)) {
          throw new Error(`Missing .bin for fixture: ${base}`);
        }
        const ctx = phaseEmit(asmPath, "TEST", {  });
        const actual = getBytes(ctx);
        const expected = loadBinBytes(binPath);
        expect(actual).toEqual(expected);
      });
    }
  });
}


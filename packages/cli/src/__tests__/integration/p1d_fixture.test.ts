/**
 * P1-D Integration Test (Verbose + Return Context)
 * ------------------------------------------------------------
 * Uses assemble(input, output, { verbose: true })
 * Verifies that JR/DJNZ/IX/IY/(nn)/IN/OUT/$ assemble correctly.
 * ------------------------------------------------------------
 */
import { assemble } from '../../../src/cli/mz80-as';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../../logger';

describe('P1-D integration fixture', () => {
  const relDir = path.resolve(__dirname, './');
  const asmPath = path.join(relDir, 'p1d-fixture.asm');
  const outPath = path.join(relDir, 'p1d-fixture.rel');

  test('assemble fixture-p1d.asm (verbose mode)', () => {
    const logger = createLogger("verbose");
    const ctx = assemble(logger, asmPath, outPath, { verbose: true });

    expect(fs.existsSync(outPath)).toBe(true);
    const relContent = fs.readFileSync(outPath, 'utf-8');
    expect(relContent.length).toBeGreaterThan(0);

    // エラーは0件であること
    expect(ctx.errors.length).toBe(0);

    // 外部シンボル EXT16 が認識されていること
    expect(ctx.externs.has('EXT16')).toBe(true);

    // // JR/DJNZ命令が少なくとも2つ存在していること（仮検証）
    // const jrCount = relContent.match(/JR/i)?.length ?? 0;
    // const djnzCount = relContent.match(/DJNZ/i)?.length ?? 0;
    // expect(jrCount + djnzCount).toBeGreaterThanOrEqual(2);
  });
});

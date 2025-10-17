import { assemble } from '../../../src/cli/mz80-as';
import fs from 'fs';
import path from 'path';
import { Logger } from '../../logger';

describe('P1-E: LST file generation', () => {
  const asmSrc = `
    ORG 0100H
START: LD A,0FFH
       DJNZ START
       JP EXT_C
       END
  `;
  const tmpDir = path.resolve(__dirname, '../../.tmp_tests');
  const asmPath = path.join(tmpDir, 'TEST_LST.asm');
  const relPath = path.join(tmpDir, 'TEST_LST.rel');
  const lstPath = relPath.replace(/\.rel$/, '.lst');

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(asmPath, asmSrc);
    const logger = new Logger();
    assemble(logger, asmPath, relPath, { verbose: false, relVersion: 2 });
  });

  it('should generate .lst file with address and source lines', () => {
    expect(fs.existsSync(lstPath)).toBe(true);
    const lst = fs.readFileSync(lstPath, 'utf-8').split(/\r?\n/);

    // 各行にアドレス4桁＋16進バイト列＋元ソースが含まれる
    const sample = lst.find(l => l.includes('LD A'));
    expect(sample).toMatch(/0100/i);
    expect(sample).toMatch(/3E FF/i);
    expect(sample).toMatch(/LD A/i);

    // 0102 10 FC DJNZ START
    const sample2 = lst.find(l => l.includes('DJNZ'));
    expect(sample2).toMatch(/0102/i);
    expect(sample2).toMatch(/10 FC/i);
    expect(sample2).toMatch(/DJNZ START/i);

    // 0104 C3 00 00 JP EXT_C
    const sample3 = lst.find(l => l.includes('JP EXT_C'));
    expect(sample3).toMatch(/0104/i);
    expect(sample3).toMatch(/C3 00 00/i);
    expect(sample3).toMatch(/JP EXT_C/i);
  });
});

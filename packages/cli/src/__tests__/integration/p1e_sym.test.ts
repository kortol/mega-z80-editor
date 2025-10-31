import { assemble } from '../../../src/cli/mz80-as';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../../logger';
import { randomUUID } from 'crypto';

describe('P1-E: SYM file generation', () => {
  const asmSrc = `
    ORG 0100H
    EXTERN EXTSYM    
ZERO  EQU 0
START: LD A,(EXTSYM)
       END
  `;
  const tmpDir = path.resolve(__dirname, '../../.tmp_tests.' + randomUUID());
  const asmPath = path.join(tmpDir, 'TEST_SYM.asm');
  const relPath = path.join(tmpDir, 'TEST_SYM.rel');
  const symPath = relPath.replace(/\.rel$/, '.sym');
  const lstmPath = relPath.replace(/\.rel$/, '.lst');

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(asmPath, asmSrc);
    const logger = createLogger("verbose");

    assemble(logger, asmPath, relPath, { verbose: false });
  });

  afterAll(() => {
    if (fs.existsSync(asmPath)) {
      fs.unlinkSync(asmPath);
    }
    if (fs.existsSync(relPath)) {
      fs.unlinkSync(relPath);
    }
    if (fs.existsSync(symPath)) {
      fs.unlinkSync(symPath);
    }
    if (fs.existsSync(lstmPath)) {
      fs.unlinkSync(lstmPath);
    }
    // 一時ディレクトリも削除
    fs.rmdirSync(tmpDir);
  })


  it('should list LABEL, CONST, and EXTERN correctly', () => {
    expect(fs.existsSync(symPath)).toBe(true);
    const sym = fs.readFileSync(symPath, 'utf-8');

    // ZERO は CONST（AST導入後に区別予定）→ 現状は LABEL 出力
    expect(sym).toMatch(/ZERO\s+0000H\s+LABEL/);

    // START は LABEL
    expect(sym).toMatch(/START\s+[0-9A-F]+H\s+LABEL/);

    // EXTSYM は EXTERN
    expect(sym).toMatch(/EXTSYM\s+----H\s+EXTERN/);
  });
});

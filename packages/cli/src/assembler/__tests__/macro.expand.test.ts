import { assembleSource, phaseEmit } from "../testUtils";

describe("macro expands", () => {

  it("macro with args expands correctly", () => {
    const src = `
  LD B,10
FILLZ MACRO COUNT,VAL
  LD B,COUNT
  LD (HL),VAL
  ENDM
FILLZ 10,0
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    // console.log(ctx);
    const txt = ctx.texts.map(t => t.data).flat();
    // console.log(txt);
    expect(txt).toContain(0x06); // LD B,n
    expect(txt).toContain(0x36); // LD (HL),n
  });

  it("EXITM stops current macro expansion", () => {
    const src = `
M1 MACRO
  LD A,1
  EXITM
  LD A,2
ENDM
M1
`;
    const ctx = assembleSource(phaseEmit, src, {});
    const txt = ctx.texts.map(t => t.data).flat();
    expect(txt).toEqual([0x3E, 0x01]);
  });
});


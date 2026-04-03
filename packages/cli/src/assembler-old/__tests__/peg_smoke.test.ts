import { assembleSource, phaseEmit, getBytes } from "../testUtils";

describe("PEG parser smoke", () => {
  test("basic directives/instructions", () => {
    const src = `
ORG 0x8000
LD A, 10
ADD A, B
LABEL1: NOP
DB 1,2,3
`;
    const ctx = assembleSource(phaseEmit, src, { parser: "peg" });
    expect(ctx.errors).toHaveLength(0);
    expect(getBytes(ctx).length).toBeGreaterThan(0);
  });
});

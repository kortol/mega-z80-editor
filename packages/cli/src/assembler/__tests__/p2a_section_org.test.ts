import { createContext } from "../context";
import { handleALIGN } from "../pseudo/align";
import { handleSECTION  } from "../pseudo/section";

test("SECTION/ALIGN maintain independent LC", () => {
  const ctx = createContext();
  handleSECTION(ctx, "TEXT");
  ctx.sections.get(ctx.currentSection)!.lc = 0x100;
  handleSECTION(ctx, "DATA");
  ctx.sections.get(ctx.currentSection)!.lc = 0x200;
  handleSECTION(ctx, "TEXT");
  expect(ctx.sections.get(ctx.currentSection)!.lc).toBe(0x100);
  handleALIGN(ctx, 0x10);
  expect(ctx.sections.get(ctx.currentSection)!.lc % 0x10).toBe(0);
});

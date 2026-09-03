import { getLC, setLC } from "../codegen/emit";
import { createContext } from "../context";
import { handleALIGN } from "../pseudo/align";
import { handleSECTION } from "../pseudo/section";

test("SECTION/ALIGN maintain independent LC", () => {
  const ctx = createContext();
  handleSECTION(ctx, "TEXT");
  setLC(ctx, 0x100);
  handleSECTION(ctx, "DATA");
  setLC(ctx, 0x200);
  handleSECTION(ctx, "TEXT");
  expect(getLC(ctx)).toBe(0x100);
  handleSECTION(ctx, "DATA");
  expect(getLC(ctx)).toBe(0x200);
  handleALIGN(ctx, 0x10);
  expect(getLC(ctx) % 0x10).toBe(0);
});

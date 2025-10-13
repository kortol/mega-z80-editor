// packages/cli/src/assembler/rel/__tests__/relv2_roundtrip.test.ts
import fs from "fs";
import path from "path";
import { createContext } from "../../context";
import { emitRelV2 } from "../builder";

test(".rel v2 writer produces MZ8R header", () => {
  const ctx = createContext();
  // 簡単なダミーセクションに1バイト入れておく
  const s = ctx.sections.get(0)!;
  s.bytes.push(0x00);

  const out = path.join(__dirname, ".tmp.rel");
  emitRelV2(ctx, out);

  const buf = fs.readFileSync(out);
  expect(buf.slice(0, 4).toString()).toBe("MZ8R"); // magic
  expect(buf[4]).toBe(2); // version
});

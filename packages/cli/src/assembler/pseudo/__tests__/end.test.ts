import { tokenize } from "../../tokenizer";
import { parse } from "../../parser";
import { AsmContext, createContext } from "../../context";
import { handleEND } from "../end";
import { buildRelFile } from "../../rel/builder";
import { TextRelAdapter } from "../../rel/adapter";
import { AssemblerErrorCode } from "../../errors";

function makeCtx(): AsmContext {
  return createContext({ moduleName: "TEST" });
}


function assemble(src: string) {
  const tokens = tokenize(src);
  const nodes = parse(tokens);
  const ctx = makeCtx();
  for (const node of nodes) {
    if (node.kind === "pseudo" && node.op === "END") {
      handleEND(ctx, node);
    }
  }
  return ctx;
}

describe("END pseudo", () => {
  test("END無し → Eレコードなし", () => {
    const ctx = makeCtx();
    ctx.texts.push({ addr: 0x100, data: [0x3E, 0x01] });
    const file = buildRelFile(ctx);
    const out = new TextRelAdapter().write(file);
    expect(out).not.toMatch(/^E/);
  });

  test("ENDのみ → Eレコードなし", () => {
    const ctx = assemble("END");
    const file = buildRelFile(ctx);
    const out = new TextRelAdapter().write(file);
    expect(out).not.toMatch(/^E/);
  });

  test("END expr → Eレコードあり", () => {
    const ctx = assemble("END 1234H");
    const file = buildRelFile(ctx);
    const out = new TextRelAdapter().write(file);
    expect(out).toContain("E 1234");
  });

  test("END extern → エラー", () => {
    const ctx = assemble("END EXT");
    expect(ctx.errors.length).toBeGreaterThan(0);
    expect(ctx.errors[0].code).toBe(AssemblerErrorCode.ExprExternInEnd);
  });
});

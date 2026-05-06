// src/__tests__/linker/expr/evalLinkExpr.test.ts
import { createMockContext } from "./mockContext";
import { ResolveFn } from "../../../linker/expr/types";
import { evalLinkExpr } from "../evalLinkExpr";

describe("P1-F: evalLinkExpr (with LinkResolveContext)", () => {
  const ctx = createMockContext();

  const resolver: ResolveFn = (name, context = ctx) => {
    if (context.symbols.has(name)) {
      return { kind: "defined", addr: context.symbols.get(name)!.addr };
    } else if (context.externs?.has(name)) {
      return { kind: "extern" };
    } else {
      return { kind: "unknown" };
    }
  };

  it("evaluates decimal constant", () => {
    const res = evalLinkExpr("1234", resolver);
    expect(res.ok).toBe(true);
    expect(res.value).toBe(0x04D2);
  });

  it("evaluates hex constant (1FH)", () => {
    const res = evalLinkExpr("1FH", resolver);
    expect(res.ok).toBe(true);
    expect(res.value).toBe(0x1F);
  });

  it("resolves defined symbol", () => {
    const res = evalLinkExpr("FOO", resolver);
    expect(res.ok).toBe(true);
    expect(res.value).toBe(0x200);
  });

  it("resolves symbol +4", () => {
    const res = evalLinkExpr("FOO+4", resolver);
    expect(res.ok).toBe(true);
    expect(res.value).toBe(0x204);
  });

  it("resolves symbol -2", () => {
    const res = evalLinkExpr("BAR-2", resolver);
    expect(res.ok).toBe(true);
    expect(res.value).toBe(0x2FE);
  });

  it("resolves dotted symbol name", () => {
    const res = evalLinkExpr("TESTNAME.TEST+1", resolver);
    expect(res.ok).toBe(true);
    expect(res.value).toBe(0x8124);
  });

  it("resolves leading-dot section symbol", () => {
    const res = evalLinkExpr(".text+10H", resolver);
    expect(res.ok).toBe(true);
    expect(res.value).toBe(0x8010);
  });

  it("returns unresolved for extern symbol", () => {
    const res = evalLinkExpr("BAZ", resolver);
    expect(res.ok).toBe(false);
    expect(res.unresolved).toContain("BAZ");
  });

  it("returns error for unsupported expression", () => {
    const res = evalLinkExpr("A+B-4", resolver);
    expect(res.ok).toBe(false);
    expect(res.errors?.[0]).toMatch(/Unsupported/);
  });

  it("returns error for empty expression", () => {
    const res = evalLinkExpr(" ", resolver);
    expect(res.ok).toBe(false);
    expect(res.errors?.[0]).toMatch(/Empty/);
  });

  it("wraps around 16-bit overflow", () => {
    const res = evalLinkExpr("0xFFFF+2", resolver);
    expect(res.ok).toBe(true);
    expect(res.value).toBe(1);
  });
});

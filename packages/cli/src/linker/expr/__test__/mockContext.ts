// src/linker/expr/__tests__/mockContext.ts
import { LinkResolveContext } from "../types";

export function createMockContext(): LinkResolveContext {
  return {
    symbols: new Map([
      ["FOO", { bank: 0, addr: 0x200 }],
      ["BAR", { bank: 0, addr: 0x300 }],
    ]),
    externs: new Set<string>(["BAZ"]),
  };
}

// src/linker/expr/types.ts

import type { LinkedSymbol } from "../core/types";

export interface LinkResolveContext {
  symbols: Map<string, LinkedSymbol>;
  externs?: Set<string>;
}

export type ResolveResult =
  | { kind: "defined"; addr: number }
  | { kind: "extern" }
  | { kind: "unknown" };

export type ResolveFn = (name: string, ctx?: LinkResolveContext) => ResolveResult;

export interface EvalOptions {
  wrap16?: boolean;
  maxDepth?: number;
  ops?: Array<"+" | "-">;
}

export interface EvalResult {
  ok: boolean;
  value?: number;
  unresolved?: string[];
  errors?: string[];
}

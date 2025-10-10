// src/linker/expr/types.ts

export interface LinkResolveContext {
  symbols: Map<string, { bank: number; addr: number }>;
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

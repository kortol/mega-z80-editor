// src/assembler/phaseManager.ts
import type { AsmContext } from "./context";

export type AsmPhase =
  | "tokenize"
  | "parse"
  | "analyze"
  | "macroExpand"
  | "emit"
  | "optimize"
  | "link";

/**
 * 各フェーズ間の正当な遷移を定義する。
 * 次フェーズへ進む際は setPhase() でこの表を参照する。
 */
export const validTransitions: Record<AsmPhase, AsmPhase[]> = {
  tokenize: ["parse", "tokenize"], // tokenize -> tokenize
  parse: ["macroExpand", "analyze"],
  analyze: ["macroExpand", "emit"],
  macroExpand: ["analyze", "emit"],
  emit: ["optimize", "link"], // pass emit -> link
  optimize: ["link", "emit"],
  link: [],
};

/**
 * 現在のフェーズを次フェーズに安全に遷移させる。
 * 無効な遷移は例外を送出する。
 */
export function setPhase(ctx: AsmContext, next: AsmPhase): void {
  const allowed = validTransitions[ctx.phase] ?? [];
  if (!allowed.includes(next)) {
    throw new Error(`Invalid phase transition: ${ctx.phase} → ${next}`);
  }
  ctx.phase = next;
  ctx.logger?.debug?.(`[Phase] ${ctx.phase}`);
}

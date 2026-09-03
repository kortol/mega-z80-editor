import type { AsmContext } from "./context";
export type AsmPhase = "tokenize" | "parse" | "analyze" | "macroExpand" | "emit" | "optimize" | "link";
/**
 * 各フェーズ間の正当な遷移を定義する。
 * 次フェーズへ進む際は setPhase() でこの表を参照する。
 */
export declare const validTransitions: Record<AsmPhase, AsmPhase[]>;
/**
 * 現在のフェーズを次フェーズに安全に遷移させる。
 * 無効な遷移は例外を送出する。
 */
export declare function setPhase(ctx: AsmContext, next: AsmPhase): void;

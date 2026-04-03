"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validTransitions = void 0;
exports.setPhase = setPhase;
/**
 * 各フェーズ間の正当な遷移を定義する。
 * 次フェーズへ進む際は setPhase() でこの表を参照する。
 */
exports.validTransitions = {
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
function setPhase(ctx, next) {
    const allowed = exports.validTransitions[ctx.phase] ?? [];
    if (!allowed.includes(next)) {
        throw new Error(`Invalid phase transition: ${ctx.phase} → ${next}`);
    }
    ctx.phase = next;
    ctx.currentPos.phase = next;
    ctx.logger?.debug?.(`[Phase] ${ctx.phase}`);
    console.log(`[Phase] ${ctx.phase}`);
}

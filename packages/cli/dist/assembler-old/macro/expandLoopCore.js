"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandLoopCore = expandLoopCore;
exports.substituteLoopTokens = substituteLoopTokens;
const errors_1 = require("../errors");
const context_1 = require("../context"); // ← context.ts 末尾に LoopFrame 統合済みの場合
const eval_1 = require("../expr/eval"); // 既存評価器
const parser_1 = require("../parser"); // 再パース用
const tokenizer_1 = require("../tokenizer"); // トークン複製
/**
 * expandLoopCore()
 * すべてのループ系マクロ(REPT/WHILE/IRP/IRPC)を統一的に展開する。
 */
function expandLoopCore(node, ctx) {
    console.log(`[expandLoopCore] start node:${JSON.stringify(node)} node.countExpr:${node.countExpr}`);
    // --- 終端系はスキップ ---
    if (node.op === "ENDW" || node.op === "ENDM") {
        ctx.logger?.debug(`[expandLoopCore] skip terminator ${node.op}`);
        return [];
    }
    const out = [];
    const meta = {
        file: ctx.currentPos.file,
        line: ctx.currentPos.line,
        level: (ctx.loopStack?.length ?? 0) + 1,
        exprText: node.condExpr?.text ??
            node.countExpr?.text ??
            node.strLiteral ??
            undefined,
    };
    // =========================================================
    // 🧩 IRPC: 文字列を1文字ずつ locals へ束縛して展開
    // =========================================================
    if (node.op === "IRPC" && node.symbolName && node.strLiteral) {
        const str = node.strLiteral;
        console.log(`[expandLoopCore] IRPC symbol=${node.symbolName} str=${str}`);
        for (let i = 0; i < str.length; i++) {
            const c = str[i];
            const code = c.charCodeAt(0);
            // localsに現在の文字を設定
            const frame = (0, context_1.pushLoop)(ctx, node.op, meta, str.length);
            frame.index = i;
            frame.locals.set(node.symbolName, c);
            // bodyTokensをコピーし、\シンボル名を現在の文字で置換
            const replacedTokens = node.bodyTokens.map((t) => {
                if (t.text === `\\${node.symbolName}`) {
                    return { ...t, kind: "num", text: String(code), value: code };
                }
                return { ...t };
            });
            console.log(`[expandLoopCore] replacedTokens:${JSON.stringify(replacedTokens)}`);
            // 本体を通常ノードとして解釈
            const nodes = (0, parser_1.parseTokens)(replacedTokens, ctx);
            // ✅ パース結果が空なら文字トークンを直接Node化
            const finalNodes = nodes.length
                ? nodes
                : replacedTokens.map((t) => ({ kind: "token", text: t.text, pos: t.pos }));
            out.push(...finalNodes);
            console.log(`[expandLoopCore] nodes:${JSON.stringify(finalNodes)} out:${JSON.stringify(out)}`);
            (0, context_1.popLoop)(ctx);
        }
        return out;
    }
    // =========================================================
    // 🧩 IRP: パラメータを1つずつ locals へ束縛して展開
    // =========================================================
    if (node.op === "IRP" && node.args && node.args.length > 0) {
        const [sym, ...rest] = node.args;
        const symbolName = String(sym).replace(/[,]/g, "").trim(); // "X"
        const argList = rest.join("").split(",").map((s) => s.trim()).filter(Boolean); // ["10","20","30"]
        for (const [i, val] of argList.entries()) {
            const frame = (0, context_1.pushLoop)(ctx, node.op, meta, argList.length);
            frame.index = i;
            frame.locals.set(symbolName, val); // ← ここが重要！
            const replacedTokens = node.bodyTokens.map((t) => t.text === `\\${symbolName}` ? { ...t, text: val } : t);
            const nodes = (0, parser_1.parseTokens)(replacedTokens, ctx);
            out.push(...(nodes.length ? nodes : replacedTokens));
            (0, context_1.popLoop)(ctx);
        }
        return out;
    }
    // =========================================================
    // 🧩 通常REPT / WHILE 処理
    // =========================================================  
    const total = (node.kind === "macroLoop" && node.op === "REPT" && node.countExpr)
        ? (0, eval_1.evalConst)(node.countExpr, ctx)
        : undefined;
    console.log(`[expandLoopCore] total:${JSON.stringify(total)}`);
    const frame = (0, context_1.pushLoop)(ctx, node.op, meta, total);
    console.log(`[expandLoopCore] frame:${JSON.stringify(frame)}`);
    let iteration = 0;
    let guard = 0;
    try {
        while (true) {
            if (++guard > (ctx.options.loopLimit ?? 10000))
                throw (0, errors_1.makeError)(errors_1.AssemblerErrorCode.LoopLimitExceeded, "Loop iteration limit exceeded");
            frame.index = iteration;
            // ループカウンタを locals/symbols にインジェクト（caseInsensitive 対応）
            const COUNTER_NAME = ctx.caseInsensitive ? "COUNTER" : "counter";
            const prevCounterSym = ctx.symbols.get(COUNTER_NAME);
            ctx.symbols.set(COUNTER_NAME, {
                value: frame.index,
                sectionId: ctx.currentSection ?? 0,
                type: "CONST",
            });
            // === 条件判定 ===
            const cont = evalLoopCondition(node, ctx, frame, iteration);
            // 元に戻す
            if (prevCounterSym) {
                ctx.symbols.set(COUNTER_NAME, prevCounterSym);
            }
            else {
                ctx.symbols.delete(COUNTER_NAME);
            }
            if (!cont)
                break;
            console.log(`[expandLoopCore] iteration:${iteration} before out:${JSON.stringify(out)}`);
            // === 本体展開 ===
            expandLoopBody(node, ctx, frame, out);
            console.log(`[expandLoopCore] iteration:${iteration} after out:${JSON.stringify(out)}`);
            iteration++;
        }
    }
    finally {
        (0, context_1.popLoop)(ctx);
    }
    return out;
}
/**
 * ループの継続条件を評価
 */
function evalLoopCondition(node, ctx, frame, iteration) {
    switch (node.op) {
        case "REPT": {
            const count = frame.total ?? 0;
            if (count < 0)
                throw (0, errors_1.makeError)(errors_1.AssemblerErrorCode.ReptCountNegative, "REPT count must be >= 0");
            if (iteration >= count)
                return false;
            return true;
        }
        case "WHILE": {
            const condVal = (0, eval_1.evalConst)(node.condExpr, ctx);
            // WHILEループのガードをカウントする
            if (++ctx.loopSeq > (ctx.options.loopLimit ?? 10000)) {
                throw (0, errors_1.makeError)(errors_1.AssemblerErrorCode.WhileLimitExceeded, "WHILE loop iteration limit exceeded", { pos: node.pos });
            }
            return Boolean(condVal);
        }
        case "IRP": {
            const args = frame.locals.get("__irpArgs") ??
                node.args?.map((a) => (0, eval_1.evalConst)(a, ctx)) ??
                [];
            frame.locals.set("__irpArgs", args);
            if (iteration >= args.length)
                return false;
            frame.locals.set(node.symbolName, args[iteration]);
            return true;
        }
        case "IRPC": {
            const chars = frame.locals.get("__irpcChars") ??
                Array.from(node.strLiteral ?? "");
            frame.locals.set("__irpcChars", chars);
            if (iteration >= chars.length)
                return false;
            frame.locals.set(node.symbolName, chars[iteration]);
            return true;
        }
        default:
            throw (0, errors_1.makeError)(errors_1.AssemblerErrorCode.Unknown, `Unknown loop kind: ${node.op}`);
    }
}
/**
 * ボディトークンを複製・再パースしてノードを生成
 */
function expandLoopBody(node, ctx, frame, out) {
    // clone tokens
    const tokens = (0, tokenizer_1.cloneTokens)(node.bodyTokens);
    // ノード分割を先に行う（REPT/IRP/WHILE/IRPC の場合）
    const nodes = (0, parser_1.parseTokens)(tokens, ctx, { macroMode: true });
    for (const n of nodes) {
        if (n.kind === "macroLoop") {
            // --- 内側REPT/IRP/IRPC/WHILE は再帰展開 ---
            const inner = expandLoopCore(n, ctx);
            out.push(...inner);
        }
        else if ("op" in n && (n.op === "ENDM" || n.op === "ENDW")) {
            // --- 終端トークンはスキップ（既に expandLoopCore でハンドル済） ---
            continue;
        }
        else {
            // --- 通常命令ノードなら引数置換して出力 ---
            substituteNodeArgs(n, ctx, frame);
            out.push(n);
        }
    }
}
function substituteNodeArgs(n, ctx, frame) {
    // 代表例: pseudo命令(DB 等)の args が { value: string | number } 等になっているケース
    if (n.args && Array.isArray(n.args)) {
        for (const a of n.args) {
            if (typeof a.value === "string") {
                const s = a.value;
                // \##MAX / \##n
                const m2 = s.match(/^\\#\\#(MAX|\d+)$/);
                if (m2) {
                    const key = m2[1];
                    a.value = String(resolveLoopCounter(ctx, key));
                    continue;
                }
                // \#（最内層）
                if (s === "\\#" || s === "#") {
                    a.value = String(resolveLoopCounter(ctx, ""));
                    continue;
                }
                // \name（IRP/IRPCローカル）
                if (s.startsWith("\\")) {
                    const name = s.slice(1);
                    if (frame.locals.has(name)) {
                        const v = frame.locals.get(name);
                        a.value = String(v);
                    }
                }
            }
        }
    }
}
/**
 * \# / \##n / \##MAX / locals をトークン上で置換
 */
function substituteLoopTokens(tokens, ctx, frame) {
    console.log(`[substituteLoopTokens] before tokens:${JSON.stringify(tokens)}`);
    for (const t of tokens) {
        if (typeof t.text !== "string")
            continue;
        console.log(`[substituteLoopTokens] processing token:${JSON.stringify(t)}`);
        // --- \##MAX / \##n ---
        const m2 = t.text.match(/^\\#\#(MAX|\d+)$/);
        if (m2) {
            const key = m2[1];
            const v = resolveLoopCounter(ctx, key);
            t.kind = "num";
            t.text = String(v);
            t.value = v;
            continue;
        }
        console.log(`[substituteLoopTokens] after ## check token:${JSON.stringify(t)}`);
        // --- \# 単体（最内層） ---
        if (t.text === "\\#" || t.text === "#") {
            const v = resolveLoopCounter(ctx, "");
            t.kind = "num";
            t.text = String(v);
            t.value = v;
            continue;
        }
        console.log(`[substituteLoopTokens] after # check token:${JSON.stringify(t)}`);
        // --- locals (IRP/IRPC) ---
        if (t.text.startsWith("\\")) {
            const name = t.text.slice(1);
            if (frame.locals.has(name)) {
                const v = frame.locals.get(name);
                t.kind = "num";
                t.text = String(v);
                t.value = v;
            }
        }
    }
    console.log(`[substituteLoopTokens] after tokens:${JSON.stringify(tokens)}`);
}
/**
 * カウンタ参照を解決
 */
function resolveLoopCounter(ctx, key) {
    if (!ctx.loopStack?.length) {
        throw (0, errors_1.makeError)(errors_1.AssemblerErrorCode.LoopCounterOutside, "Loop counter used outside any loop.");
    }
    // 最内層
    if (key === "") {
        const top = ctx.loopStack.at(-1);
        return top?.index ?? 0;
    }
    // 最外層の最大インデックス
    if (key === "MAX") {
        const first = ctx.loopStack.at(0);
        return first?.maxIndex ?? 0;
    }
    // \##n (外層)
    const n = parseInt(key, 10);
    const frame = ctx.loopStack.at(-(n + 1));
    if (!frame) {
        throw (0, errors_1.makeError)(errors_1.AssemblerErrorCode.LoopCounterOutOfScope, `No outer loop level #${n}`);
    }
    return frame.index;
}

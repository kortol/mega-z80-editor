import { AsmContext } from "../context";
import { AssemblerError, AssemblerErrorCode, makeError } from "../errors";
import { Node, NodeLoopBase } from "../parser";
import {
  LoopFrame,
  LoopKind,
  pushLoop,
  popLoop,
  traceLoopStack,
} from "../context"; // ← context.ts 末尾に LoopFrame 統合済みの場合

import { evalConst, evalExpr, makeEvalCtx } from "../expr/eval";   // 既存評価器
import { parseExpr } from "../expr/parserExpr";
import { parseTokens } from "../parser";    // 再パース用
import { cloneTokens, tokenize } from "../tokenizer"; // トークン複製

/**
 * expandLoopCore()
 * すべてのループ系マクロ(REPT/WHILE/IRP/IRPC)を統一的に展開する。
 */
export function expandLoopCore(node: NodeLoopBase, ctx: AsmContext): Node[] {
  // --- 終端系はスキップ ---
  if (node.op === "ENDW" || node.op === "ENDM") {
    ctx.logger?.debug(`[expandLoopCore] skip terminator ${node.op}`);
    return [];
  }

  const out: Node[] = [];

  const meta = {
    file: ctx.currentPos.file,
    line: ctx.currentPos.line,
    level: (ctx.loopStack?.length ?? 0) + 1,
    exprText:
      node.condExpr?.text ??
      node.countExpr?.text ??
      node.strLiteral ??
      undefined,
  };

  // =========================================================
  // 🧩 IRPC: 文字列を1文字ずつ locals へ束縛して展開
  // =========================================================
  if (node.op === "IRPC" && node.symbolName && node.strLiteral) {
    const str = node.strLiteral;

    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      const code = c.charCodeAt(0);

      // localsに現在の文字を設定
      const frame = pushLoop(ctx, node.op, meta, str.length);
      frame.index = i;
      frame.locals.set(node.symbolName, c);

      // bodyTokensをコピーし、\シンボル名を現在の文字で置換
      const replacedTokens = node.bodyTokens.map((t) => {
        if (t.text === `\\${node.symbolName}`) {
          return { ...t, kind: "num", text: String(code), value: code };
        }
        return { ...t };
      });

      // 本体を通常ノードとして解釈
      const nodes = parseTokens(replacedTokens, ctx);
      // ✅ パース結果が空なら文字トークンを直接Node化
      const finalNodes: Node[] = nodes.length
        ? nodes
        : replacedTokens.map((t) => ({ kind: "token", text: t.text, pos: t.pos }) as unknown as Node);

      out.push(...finalNodes);

      popLoop(ctx);
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
      const frame = pushLoop(ctx, node.op, meta, argList.length);
      frame.index = i;
      frame.locals.set(symbolName, val);  // ← ここが重要！

      const replacedTokens = node.bodyTokens.map((t) =>
        t.text === `\\${symbolName}` ? { ...t, text: val } : t
      );
      const nodes = parseTokens(replacedTokens, ctx);
      out.push(...(nodes.length ? nodes : replacedTokens as any));

      popLoop(ctx);
    }

    return out;
  }

  // =========================================================
  // 🧩 通常REPT / WHILE 処理
  // =========================================================  
  const total = (node.kind === "macroLoop" && node.op === "REPT" && node.countExpr)
    ? evalConst(node.countExpr, ctx)
    : undefined;

  const frame = pushLoop(ctx, node.op, meta, total);

  let iteration = 0;
  let guard = 0;

  try {
    while (true) {
      if (++guard > ((ctx.options as any).loopLimit ?? 10000))
        throw makeError(
          AssemblerErrorCode.LoopLimitExceeded,
          "Loop iteration limit exceeded",
        );

      frame.index = iteration;

      // ループカウンタを locals/symbols にインジェクト（caseInsensitive 対応）
      const COUNTER_NAME = ctx.caseInsensitive ? "COUNTER" : "counter";
      const prevCounterSym = ctx.symbols.get(COUNTER_NAME);
      ctx.symbols.set(COUNTER_NAME, {
        value: frame.index,
        sectionId: ctx.currentSection ?? 0,
        type: "CONST",
        pos: ctx.currentPos,
      });

      // === 条件判定 ===
      const cont = evalLoopCondition(node, ctx, frame, iteration);
      // 元に戻す
      if (prevCounterSym) {
        ctx.symbols.set(COUNTER_NAME, prevCounterSym);
      } else {
        ctx.symbols.delete(COUNTER_NAME);
      }
      if (!cont) break;

      // === 本体展開 ===
      expandLoopBody(node, ctx, frame, out);

      iteration++;
    }
  } finally {
    popLoop(ctx);
  }

  return out;
}

/**
 * ループの継続条件を評価
 */
function evalLoopCondition(
  node: NodeLoopBase,
  ctx: AsmContext,
  frame: LoopFrame,
  iteration: number,
): boolean {

  switch (node.op) {
    case "REPT": {
      const count = frame.total ?? 0;
      if (count < 0)
        throw makeError(
          AssemblerErrorCode.ReptCountNegative,
          "REPT count must be >= 0",
        );
      if (iteration >= count) return false;
      return true;
    }
    case "WHILE": {
      const condVal = evalConst(node.condExpr, ctx);
      // WHILEループのガードをカウントする
      if (++ctx.loopSeq > ((ctx.options as any).loopLimit ?? 10000)) {
        throw makeError(
          AssemblerErrorCode.WhileLimitExceeded,
          "WHILE loop iteration limit exceeded",
          { pos: node.pos }
        );
      }
      return Boolean(condVal);
    }
    case "IRP": {
      const args =
        frame.locals.get("__irpArgs") ??
        node.args?.map((a) => evalConst(a, ctx)) ??
        [];
      frame.locals.set("__irpArgs", args);
      if (iteration >= args.length) return false;
      frame.locals.set(node.symbolName!, args[iteration]);
      return true;
    }
    case "IRPC": {
      const chars =
        frame.locals.get("__irpcChars") ??
        Array.from(node.strLiteral ?? "");
      frame.locals.set("__irpcChars", chars);
      if (iteration >= chars.length) return false;
      frame.locals.set(node.symbolName!, chars[iteration]);
      return true;
    }
    default:
      throw makeError(
        AssemblerErrorCode.Unknown,
        `Unknown loop kind: ${node.op}`,
      );
  }
}

/**
 * ボディトークンを複製・再パースしてノードを生成
 */
function expandLoopBody(node: NodeLoopBase, ctx: AsmContext, frame: LoopFrame, out: Node[]) {
  // clone tokens
  const tokens = cloneTokens(node.bodyTokens);

  // ノード分割を先に行う（REPT/IRP/WHILE/IRPC の場合）
  const nodes = parseTokens(tokens, ctx, { macroMode: true });

  for (const n of nodes) {
    if (n.kind === "macroLoop") {
      // --- 内側REPT/IRP/IRPC/WHILE は再帰展開 ---
      const inner = expandLoopCore(n, ctx);
      out.push(...inner);
    } else if ("op" in n && (n.op === "ENDM" || n.op === "ENDW")) {
      // --- 終端トークンはスキップ（既に expandLoopCore でハンドル済） ---
      continue;
    } else {
      // --- 通常命令ノードなら引数置換して出力 ---
      substituteNodeArgs(n, ctx, frame);
      // --- WHILE/REPT で SET が出た場合は即時反映 ---
      if ((n as any).kind === "pseudo" && String((n as any).op).toUpperCase() === "SET") {
        applySetInMacro(ctx, n as any);
      }
      out.push(n);
    }
  }
}

function applySetInMacro(ctx: AsmContext, node: any) {
  const arg = node.args?.[0];
  const key = arg?.key;
  const valStr = arg?.value;
  if (!key || typeof valStr !== "string") return;

  const sym = ctx.caseInsensitive ? String(key).toUpperCase() : String(key);
  const cleaned = valStr.replace(/,/g, " ");
  const tokens = tokenize(ctx, cleaned).filter((t) => t.kind !== "eol");
  const expr = parseExpr(tokens);
  const res = evalExpr(expr, makeEvalCtx(ctx));
  if (res.kind !== "Const") return;

  ctx.symbols.set(sym, {
    value: res.value,
    sectionId: ctx.currentSection ?? 0,
    type: "CONST",
    pos: ctx.currentPos,
  });
}

function substituteNodeArgs(n: Node, ctx: AsmContext, frame: LoopFrame) {
  if ((n as any).args && Array.isArray((n as any).args) && typeof (n as any).args[0] === "string") {
    (n as any).args = (n as any).args.map((s: string) => replaceLoopRefInString(s, ctx, frame));
    return;
  }

  // 代表例: pseudo命令(DB 等)の args が { value: string | number } 等になっているケース
  if ((n as any).args && Array.isArray((n as any).args)) {
    for (const a of (n as any).args) {
      if (typeof a.value === "string") {
        a.value = replaceLoopRefInString(a.value as string, ctx, frame);
      }
    }
  }
}

function replaceLoopRefInString(s: string, ctx: AsmContext, frame: LoopFrame): string {
  // \##MAX / \##n
  const m2 = s.match(/^\\+##(MAX|\d+)$/);
  if (m2) {
    const key = m2[1];
    return String(resolveLoopCounter(ctx, key));
  }

  // \#（最内層）
  if (s === "\\#" || s === "#") {
    return String(resolveLoopCounter(ctx, ""));
  }

  // \name（IRP/IRPCローカル）
  if (s.startsWith("\\")) {
    const name = s.replace(/^\\+/, "");
    if (frame.locals.has(name)) {
      const v = frame.locals.get(name);
      return String(v);
    }
  }

  // CONST シンボルは現在値で展開（WHILE 内の変数更新用）
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
    const key = ctx.caseInsensitive ? s.toUpperCase() : s;
    const entry: any = ctx.symbols.get(key);
    if (entry && entry.type === "CONST" && typeof entry.value === "number") {
      return String(entry.value);
    }
  }

  return s;
}

/**
 * \# / \##n / \##MAX / locals をトークン上で置換
 */
export function substituteLoopTokens(tokens: any[], ctx: AsmContext, frame: LoopFrame) {
  for (const t of tokens) {
    if (typeof t.text !== "string") continue;

    // --- \##MAX / \##n ---
    const m2 = t.text.match(/^\\#\#(MAX|\d+)$/);
    if (m2) {
      const key = m2[1];
      const v = resolveLoopCounter(ctx, key);
      t.kind = "num";
      t.text = String(v);
      (t as any).value = v;
      continue;
    }

    // --- \# 単体（最内層） ---
    if (t.text === "\\#" || t.text === "#") {
      const v = resolveLoopCounter(ctx, "");
      t.kind = "num";
      t.text = String(v);
      (t as any).value = v;
      continue;
    }

    // --- locals (IRP/IRPC) ---
    if (t.text.startsWith("\\")) {
      const name = t.text.slice(1);
      if (frame.locals.has(name)) {
        const v = frame.locals.get(name);
        t.kind = "num";
        t.text = String(v);
        (t as any).value = v;
      }
    }
  }
}

/**
 * カウンタ参照を解決
 */
function resolveLoopCounter(ctx: AsmContext, key: string): number {
  if (!ctx.loopStack?.length) {
    throw makeError(
      AssemblerErrorCode.LoopCounterOutside,
      "Loop counter used outside any loop.",
    );
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
    throw makeError(
      AssemblerErrorCode.LoopCounterOutOfScope,
      `No outer loop level #${n}`,
    );
  }

  return frame.index;
}

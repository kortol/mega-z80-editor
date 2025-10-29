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

import { evalConst } from "../expr/eval";   // 既存評価器
import { parseTokens } from "../parser";    // 再パース用
import { cloneTokens } from "../tokenizer"; // トークン複製

/**
 * expandLoopCore()
 * すべてのループ系マクロ(REPT/WHILE/IRP/IRPC)を統一的に展開する。
 */
export function expandLoopCore(node: NodeLoopBase, ctx: AsmContext): Node[] {
  console.log(`[expandLoopCore] start node:${JSON.stringify(node)} node.countExpr:${node.countExpr}`);
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

  const total = (node.kind === "macroLoop" && node.op === "REPT" && node.countExpr)
    ? evalConst(node.countExpr, ctx)
    : undefined;
  console.log(`[expandLoopCore] total:${JSON.stringify(total)}`);

  const frame = pushLoop(ctx, node.op, meta, total);
  console.log(`[expandLoopCore] frame:${JSON.stringify(frame)}`);

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

      // === 条件判定 ===
      const cont = evalLoopCondition(node, ctx, frame, iteration);
      if (!cont) break;

      console.log(`[expandLoopCore] iteration:${iteration} before out:${JSON.stringify(out)}`);
      // === 本体展開 ===
      expandLoopBody(node, ctx, frame, out);
      console.log(`[expandLoopCore] iteration:${iteration} after out:${JSON.stringify(out)}`);

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
  // 1. clone tokens
  const tokens = cloneTokens(node.bodyTokens);

  // 2. 反復カウンタや locals を置換
  substituteLoopTokens(tokens, ctx, frame);

  // 3. 再パースしてノードを生成
  const bodyNodes = parseTokens(tokens, ctx, { macroMode: true });

  // 4. 出力へ追加
  out.push(...bodyNodes);
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
      t.text = String(resolveLoopCounter(ctx, key));
      continue;
    }

    // --- \# 単体（最内層） ---
    if (t.text === "\\#") {
      t.text = String(resolveLoopCounter(ctx, ""));
      continue;
    }

    // --- locals (IRP/IRPC) ---
    if (t.text.startsWith("\\")) {
      const name = t.text.slice(1);
      if (frame.locals.has(name)) {
        const v = frame.locals.get(name);
        t.text = typeof v === "string" ? v : String(v);
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

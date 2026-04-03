// packages/cli/src/assembler/macro.ts
import { AsmContext, canon, SourcePos } from "./context";
import { parse } from "./macroParser";
import type { Node, NodeMacroDef, NodeMacroInvoke } from "./node";
import { AssemblerErrorCode, makeError } from "./errors";
import { Token, tokenize } from "./tokenizer";
import { defineMacro } from "./macro/defineMacro";
import { expandLoopCore } from "./macro/expandLoopCore";
import { evalExpr, makeEvalCtx } from "./expr/eval";
import { parseExpr } from "./expr/parserExpr";

// マクロ展開の最大深度（無限ループ防止）
const MAX_MACRO_EXPAND_DEPTH = 15;

function trimAtExitm(nodes: Node[]): Node[] {
  const idx = nodes.findIndex((n) => n.kind === "pseudo" && String((n as any).op).toUpperCase() === "EXITM");
  if (idx < 0) return nodes;
  return nodes.slice(0, idx);
}

// --- ✨ 新規追加：ローカルスコープ管理スタック ---
export interface MacroScope {
  table: Map<string, NodeMacroDef>;
}

export function pushMacroScope(ctx: AsmContext) {
  ctx.macroTableStack ??= [];
  const newScope = new Map<string, NodeMacroDef>();
  ctx.macroTableStack.push(newScope);
}

export function popMacroScope(ctx: AsmContext) {
  if (ctx.macroTableStack?.length) {
    ctx.macroTableStack.pop();
  }
}

export function defineLocalMacro(def: NodeMacroDef, ctx: AsmContext) {
  const scope = ctx.localMacroStack?.at(-1);
  if (scope) scope.table.set(def.name.toUpperCase(), def);
}

export function findMacro(name: string, ctx: AsmContext): NodeMacroDef | undefined {
  // 1. ローカルスコープ優先検索
  for (let i = (ctx.localMacroStack?.length ?? 0) - 1; i >= 0; i--) {
    const scope = ctx.localMacroStack![i];
    const def = scope.table.get(name.toUpperCase());
    if (def) return def;
  }
  // 2. グローバルマクロ検索
  return ctx.macroTable.get(name.toUpperCase());
}

/** pos.parent を付与してトークンを複製 */
function cloneTokensWithParent(tokens: Token[], parent: SourcePos): Token[] {
  return tokens.map(t => ({
    ...t,
    pos: { file: t.pos.file, line: t.pos.line, column: t.pos.column, parent } as SourcePos,
  }));
}

/** LOCALMACRO ブロック（入れ子対応）を本文から取り除く */
function stripLocalMacroBlocks(tokens: Token[]): Token[] {
  const out: Token[] = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (
      t.kind === "ident" &&
      t.text.toUpperCase() === "LOCALMACRO" &&
      i + 1 < tokens.length &&
      tokens[i + 1].kind === "ident"
    ) {
      depth++;
      continue; // LOCALMACRO の行自体も落とす
    }
    if (depth > 0 && t.kind === "ident" && t.text.toUpperCase() === "LOCALMACRO") {
      depth++;
      continue;
    }
    if (depth > 0 && t.kind === "ident" && t.text.toUpperCase() === "ENDM") {
      depth--;
      continue;
    }
    if (depth === 0) out.push(t);
  }
  return out;
}

/** 引数とローカルラベルを置換したトークン列を生成 */
function rewriteTokensForMacro(def: NodeMacroDef, inv: NodeMacroInvoke): Token[] {
  const argMap = new Map<string, string>();
  const params = def.params ?? [];
  const args = inv.args ?? [];

  if (params.length !== args.length) {
    throw makeError(
      AssemblerErrorCode.MacroArgCountMismatch,
      `Macro '${def.name}' expects ${params.length} args, got ${args.length}`,
      { pos: inv.pos }
    );
  }

  // 大文字キーで統一（caseInsensitive 環境で安全）
  params.forEach((p, i) => argMap.set(p.toUpperCase(), args[i]));

  // ローカルラベルを一意化（%%xxx）
  const localMap = new Map<string, string>();
  let seq = 0;
  for (const t of def.bodyTokens) {
    if (t.kind === "ident" && t.text.startsWith("%%")) {
      if (!localMap.has(t.text)) {
        localMap.set(t.text, `__M_${def.name}_${seq++}_${Math.random().toString(36).slice(2, 5)}`);
      }
    }
  }

  // --- 置換 ---
  return def.bodyTokens.map(t => {
    if (t.kind !== "ident") return { ...t };
    const upper = t.text.toUpperCase();
    const positional = /^\\(\d+)$/.exec(t.text);
    if (positional) {
      const idx = Number(positional[1]) - 1;
      if (idx >= 0 && idx < args.length) {
        return { ...t, text: args[idx] };
      }
    }
    if (argMap.has(upper)) {
      return { ...t, text: argMap.get(upper)! };
    }
    if (localMap.has(t.text)) {
      return { ...t, text: localMap.get(t.text)! };
    }
    return { ...t };
  });
}

export function getDefByName(ctx: AsmContext, name: string): NodeMacroDef | undefined {
  const key = canon(name, ctx);

  // --- 🔹 1. ローカルスコープを上から順に探索 ---
  for (let i = ctx.macroTableStack.length - 1; i >= 0; i--) {
    const scope = ctx.macroTableStack[i];
    const local = scope.get(key);
    if (local) {
      ctx.logger?.debug(`[lookup] '${name}' -> found in LOCAL (stack idx=${i})`);
      return local;
    }
  }

  // --- 🔹 2. グローバルスコープ ---
  const global = ctx.macroTable.get(key);
  if (global) {
    ctx.logger?.debug(`[lookup] '${name}' -> found in GLOBAL`);
    return global;
  }

  // --- 🔹 3. M80互換モード：命令上書きマクロを再確認 ---
  if (!ctx.options.strictMacro && ctx.macroTable.has(key)) {
    ctx.logger?.debug(`[lookup] '${name}' -> found in OVERRIDE`);
    return ctx.macroTable.get(key);
  }

  ctx.logger?.debug(`[lookup] '${name}' -> NOT FOUND`);
  return undefined;
}


// ----- ここから本体 -----
export function expandMacros(ctx: AsmContext, depth = 0): void {
  if (!ctx.nodes) return;
  if (ctx.didExpand) return; // 二重展開防止

  if (depth > MAX_MACRO_EXPAND_DEPTH) {
    ctx.errors.push(
      makeError(
        AssemblerErrorCode.MacroRecursionLimit,
        `Macro expansion exceeded ${MAX_MACRO_EXPAND_DEPTH} levels (possible recursive macro)`,
        {}
      )
    );
    return;
  }

  ctx.logger?.debug(`[expandMacros] start, nodes=${ctx.nodes?.length ?? 0}`);

  function dumpTables(where: string) {
    const globalKeys = Array.from(ctx.macroTable.keys());
    const stackDepth = ctx.macroTableStack?.length ?? 0;
    const topKeys = stackDepth ? Array.from(ctx.macroTableStack[stackDepth - 1].keys()) : [];
    ctx.logger?.debug(`[tables@${where}] global=${JSON.stringify(globalKeys)} stackDepth=${stackDepth} top=${JSON.stringify(topKeys)}`);
  }
  dumpTables("before");

  // 1) グローバル MACRO 定義を登録（LOCAL はここでは登録しない）
  for (const n of ctx.nodes) {
    if (n.kind === "macroDef") {
      const def = n as NodeMacroDef;
      if (def.isLocal) continue;
      defineMacro(def.name, def.params, def.bodyTokens, ctx, def.pos, false);
    }
  }

  // グローバル登録直後
  dumpTables("after-global-register");

  // 2) M80互換: 命令ノードをマクロ呼び出しに昇格
  if (!ctx.options.strictMacro) {
    for (let i = 0; i < ctx.nodes.length; i++) {
      const n = ctx.nodes[i];
      if (n.kind === "instr") {
        const key = canon(n.op, ctx);
        if (ctx.macroTable?.has(key)) {
          ctx.logger?.debug(`[promote] instr '${n.op}' -> macroInvoke '${key}' at ${n.pos.file}:${n.pos.line}`);
          const def = ctx.macroTable.get(key)!;
          ctx.nodes[i] = {
            kind: "macroInvoke",
            name: def.name,
            args: (n as any).args ?? [],
            pos: n.pos,
          } as NodeMacroInvoke;
        }
      }
    }
  }

  const out: Node[] = [];
  ctx.expansionStack ??= [];

  // スタック優先で解決（無ければグローバルへ）
  for (const n of ctx.nodes) {
    ctx.logger?.debug(`[expandMacros] iter=${n}, in=${ctx.nodes?.length}`);

    // 🟩 1️⃣ ループマクロ（REPT / IRP / WHILE 等）
    if (n.kind === "macroLoop") {

      ctx.logger?.debug(`[expandMacros] expand loop macro: ${(n as any).op}`);
      // A. ループ展開
      const nodes = expandLoopCore(n as any, ctx);
      // D. 内側に更なる macroInvoke / macroLoop があれば再帰展開
      if (nodes.some(x => x.kind === "macroInvoke" || x.kind === "macroLoop")) {
        const savedNodes: Node[] = ctx.nodes;
        const savedStack = [...ctx.macroTableStack];
        ctx.nodes = nodes;
        expandMacros(ctx, depth + 1);
        nodes.splice(0, nodes.length, ...ctx.nodes);
        ctx.macroTableStack = savedStack;
        ctx.nodes = savedNodes;
      }
      out.push(...nodes);
      continue;
    }

    // 🟩 SET は macroExpand 段階でも反映（WHILE 条件用）
    if (n.kind === "pseudo" && String((n as any).op).toUpperCase() === "SET") {
      applySetForMacroExpand(ctx, n as any);
      out.push(n);
      continue;
    }

    // 🟩 2️⃣ 通常のマクロ呼び出し
    if (n.kind !== "macroInvoke") {
      out.push(n);
      continue;
    }

    // 🟩 3️⃣ 通常マクロ展開処理（既存のコード）
    const inv = n as NodeMacroInvoke;
    ctx.logger?.debug(`[expandMacros] invoke: ${inv.name} @${inv.pos.file}:${inv.pos.line}`);
    const def = getDefByName(ctx, inv.name);
    if (!def) {
      ctx.errors.push(
        makeError(AssemblerErrorCode.SyntaxError, `Macro '${inv.name}' is not defined`, { pos: inv.pos })
      );
      continue;
    }

    const hasLocalDefs = def.bodyTokens.some(
      t => t.kind === "ident" && t.text.toUpperCase() === "LOCALMACRO"
    );

    ctx.logger?.debug(`[expandMacros] hasLocalDefs: ${hasLocalDefs} def found: ${def.name} (local=${def.isLocal})`);
    if (hasLocalDefs) {
      dumpTables("before-push");
      // --- 🟩 ローカルマクロを有効化 ---
      pushMacroScope(ctx);
      dumpTables("after-push");
    }

    try {

      // ここで locals を登録
      // let workingBody = def.bodyTokens;
      // 1️⃣ ローカルマクロ定義を抽出して登録
      // if (!def.isLocal && def.bodyTokens) {
      //   // 1) bodyTokens から LOCALMACRO を拾ってローカルとして登録
      //   const localDefs = parse(ctx, def.bodyTokens).filter(
      //     (n): n is NodeMacroDef => n.kind === "macroDef" && (n as NodeMacroDef).isLocal === true
      //   );
      if (hasLocalDefs) {
        function isNodeMacroDef(n: Node): n is NodeMacroDef {
          return n.kind === "macroDef";
        }
        const localNodes = parse(ctx, def.bodyTokens)
          .filter((n): n is NodeMacroDef => isNodeMacroDef(n) && n.isLocal);
        ctx.logger?.debug(`[locals] found ${localNodes.length} local defs in '${def.name}'`);
        for (const m of localNodes) {
          ctx.logger?.debug(`[locals] found ${localNodes.length} local defs in '${def.name}'`);
          defineMacro(m.name, m.params, m.bodyTokens, ctx, m.pos, true);
        }
        dumpTables("after-local-register");
      }

      // 2️⃣ LOCALMACRO ブロックを削除
      ctx.logger?.debug("[rewrite] stripLocalMacroBlocks...");
      // 2) 本文から LOCALMACRO〜ENDM ブロックを除去して展開対象にする
      const workingBody = stripLocalMacroBlocks(def.bodyTokens);
      ctx.logger?.debug(`[locals] stripped body length: ${workingBody.length}`);

      // 3️⃣ 引数置換＋pos付与
      ctx.logger?.debug("[rewrite] rewriteTokensForMacro...");
      // 3) 引数・ローカルラベル置換 → 呼び出し元 pos を parent に付与 → 再パース
      const rewritten = rewriteTokensForMacro({ ...def, bodyTokens: workingBody }, inv);
      const cloned = cloneTokensWithParent(rewritten, inv.pos);

      // 4️⃣ 本文再パース
      const expanded = trimAtExitm(parse(ctx, cloned));

      // 5️⃣ ネストしたマクロを再展開
      if (expanded.some(n => n.kind === "macroInvoke")) {
        ctx.logger?.debug(`[expandMacros] nested expand inside ${def.name}`);
        const savedNodes: Node[] | undefined = ctx.nodes;
        const savedStack = [...ctx.macroTableStack];
        ctx.nodes = expanded;
        expandMacros(ctx, depth + 1);
        expanded.splice(0, expanded.length, ...ctx.nodes);
        ctx.macroTableStack = savedStack;
        ctx.nodes = savedNodes;
      }

      out.push(...expanded);

    } catch (e: any) {
      ctx.errors.push(e);
    } finally {
      if (hasLocalDefs) {
        dumpTables("before-pop");
        // ← ぜったいスコープを閉じる！
        popMacroScope(ctx);
        dumpTables("after-pop");
      }
    }
  }
  ctx.logger?.debug(`[expandMacros] done, nodes=${ctx.nodes.length}`);

  // --- 展開後ノードを置き換え ---
  ctx.nodes = out;
  ctx.didExpand = true;

  // 🟩 ネストされたマクロ呼び出しを再帰展開する（再帰的に呼ぶ）
  const hasMore = ctx.nodes.some(n =>
    n.kind === "macroInvoke" || n.kind === "macroLoop"
  );
  ctx.logger?.debug(`[expandMacros] hasMore=${hasMore}`);
  if (hasMore) {
    ctx.logger?.debug(`[expandMacros] recursive expand...`);
    expandMacros(ctx, depth + 1);
  }
}

function applySetForMacroExpand(ctx: AsmContext, node: any) {
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

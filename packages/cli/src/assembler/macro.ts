import { AsmContext, canon, MacroDef, popMacroScope, pushMacroScope, SourcePos } from "./context";
import { Node, NodeMacroDef, NodeMacroInvoke, parse } from "./parser";
import { AssemblerErrorCode, makeError } from "./errors";
import { Token } from "./tokenizer";
import { defineMacro } from "./macro/defineMacro";

/** pos.parent を付与してトークンを複製 */
function cloneTokensWithParent(tokens: Token[], parent: SourcePos): Token[] {
  return tokens.map(t => ({
    ...t,
    pos: { file: t.pos.file, line: t.pos.line, column: t.pos.column, parent } as SourcePos,
  }));
}

/** 引数とローカルラベルを置換したトークン列を生成 */
function rewriteTokensForMacro(
  def: MacroDef,
  inv: NodeMacroInvoke
): Token[] {
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

  params.forEach((p, i) => argMap.set(p.toUpperCase(), args[i]));

  // --- ローカルラベル一意化 ---
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
  const replaced = def.bodyTokens.map(t => {
    if (t.kind !== "ident") return { ...t };
    const upper = t.text.toUpperCase();
    if (argMap.has(upper)) {
      return { ...t, text: argMap.get(upper)! };
    }
    if (localMap.has(t.text)) {
      return { ...t, text: localMap.get(t.text)! };
    }
    return { ...t };
  });

  return replaced;
}

export function expandMacros(ctx: AsmContext): void {
  if (!ctx.nodes) return;

  // --- 🧩 1. マクロ定義ノードを登録（未登録のみ） ---
  for (const n of ctx.nodes) {
    if (n.kind === "macroDef") {
      const def = n as NodeMacroDef;
      if (def.isLocal) continue; // local は展開時登録のみ
      const key = canon(def.name, ctx);

      // 🟩 既に登録済みならスキップ（INCLUDE二重定義防止）
      if (ctx.macroTable.has(key)) continue;

      defineMacro(def.name, def.params, def.bodyTokens, ctx, def.pos, def.isLocal ?? false);
    }
  }

  // --- 🧩 2. M80互換モード: 命令ノードがマクロ名と一致する場合、マクロ呼び出しとして扱う ---
  if (!ctx.options.strictMacro) {
    for (let i = 0; i < ctx.nodes.length; i++) {
      const n = ctx.nodes[i];
      if (n.kind === "instr") {
        const key = canon(n.op, ctx);
        if (ctx.macroTable?.has(key)) {
          const def = ctx.macroTable.get(key)!;
          ctx.nodes[i] = {
            kind: "macroInvoke",
            name: def.name,
            args: n.args ?? [],
            pos: n.pos,
          } as NodeMacroInvoke;
        }
      }
    }
  }

  const out: Node[] = [];
  ctx.expansionStack ??= [];

  function getDefByName(ctx: AsmContext, name: string): MacroDef | undefined {
    const key = canon(name, ctx);
    for (let i = ctx.macroTableStack.length - 1; i >= 0; i--) {
      const def = ctx.macroTableStack[i].get(key);
      if (def) return def;
    }
    return undefined;
  }

  for (const n of ctx.nodes) {
    if (n.kind !== "macroInvoke") {
      out.push(n);
      continue;
    }

    const inv = n as NodeMacroInvoke;
    const def = getDefByName(ctx, inv.name);
    if (!def) {
      ctx.errors.push(
        makeError(
          AssemblerErrorCode.SyntaxError,
          `Macro '${inv.name}' is not defined`,
          { pos: inv.pos }
        )
      );
      continue;
    }

    // --- 🟩 ローカルマクロを有効化 ---
    console.log(`[macroExpand] expanding ${def.name}, local=${def.isLocal}`);
    pushMacroScope(ctx);
    console.log(`[macroExpand] scopeDepth=${ctx.macroTableStack.length}`);

    // --- 🟩 外側マクロ展開時、bodyTokensからLOCALMACROを登録 ---
    if (!def.isLocal && def.bodyTokens) {
      // def.bodyTokens 内をパースして、ローカルマクロを登録
      const localDefs = parse(ctx, def.bodyTokens)
        .filter(n => n.kind === "macroDef" && (n as any).isLocal);
      for (const m of localDefs) {
        console.log(`[macro expand] mdef:${JSON.stringify(m)}`);
        ctx.macroTableStack[ctx.macroTableStack.length - 1]
          .set(canon((m as any).name, ctx), {
            name: (m as any).name,
            params: (m as any).params,
            bodyTokens: (m as any).bodyTokens,
            defPos: (m as any).pos,
            isLocal: true
          });
      }
    }

    try {
      // ★ 引数とローカルラベルの置換を適用
      const rewritten = rewriteTokensForMacro(def, inv);

      // ★ 呼び出し元posをparentに設定
      const cloned = cloneTokensWithParent(rewritten, inv.pos);

      // 再パースして展開
      const expanded = parse(ctx, cloned);
      console.log(`[macroExpand] expanded ${def.name}, nodes=${expanded.length}`);
      out.push(...expanded);

    } catch (e: any) {
      ctx.errors.push(e);
    } finally {
      // --- 🧩 ローカルマクロスコープ終了 ---
      popMacroScope(ctx, false);
      console.log(`[macroExpand] popScope → depth=${ctx.macroTableStack.length}`);
    }
  }

  ctx.nodes = out;
}

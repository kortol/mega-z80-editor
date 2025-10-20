import { AsmContext, SourcePos } from "./context";
import { Node, NodeMacroDef, NodeMacroInvoke, parse } from "./parser";
import { AssemblerErrorCode, makeError } from "./errors";
import { Token } from "./tokenizer";

/** pos.parent を付与してトークンを複製 */
function cloneTokensWithParent(tokens: Token[], parent: SourcePos): Token[] {
  return tokens.map(t => ({
    ...t,
    pos: { file: t.pos.file, line: t.pos.line, column: t.pos.column, parent } as SourcePos,
  }));
}

/** 引数とローカルラベルを置換したトークン列を生成 */
function rewriteTokensForMacro(
  def: NodeMacroDef,
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

  const out: Node[] = [];
  ctx.expansionStack ??= [];

  const getDef = (name: string): NodeMacroDef | undefined => {
    const key = ctx.caseInsensitive ? name.toUpperCase() : name;
    return ctx.nodes!.find(
      n =>
        n.kind === "macroDef" &&
        (ctx.caseInsensitive
          ? (n as NodeMacroDef).name.toUpperCase() === key
          : (n as NodeMacroDef).name === name)
    ) as NodeMacroDef | undefined;
  };

  for (const n of ctx.nodes) {
    if (n.kind !== "macroInvoke") {
      out.push(n);
      continue;
    }

    const inv = n as NodeMacroInvoke;
    const def = getDef(inv.name);
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

    // 循環検知
    const key = ctx.caseInsensitive ? def.name.toUpperCase() : def.name;
    if (ctx.expansionStack.includes(key)) {
      ctx.errors.push(
        makeError(
          AssemblerErrorCode.ExprCircularRef,
          `Recursive macro expansion detected: ${def.name}`,
          { pos: inv.pos }
        )
      );
      continue;
    }

    ctx.expansionStack.push(key);
    try {
      // ★ 引数とローカルラベルの置換を適用
      const rewritten = rewriteTokensForMacro(def, inv);

      // ★ 呼び出し元posをparentに設定
      const cloned = cloneTokensWithParent(rewritten, inv.pos);

      // 再パースして展開
      const expanded = parse(ctx, cloned);
      out.push(...expanded);
    } catch (e: any) {
      ctx.errors.push(e);
    } finally {
      ctx.expansionStack.pop();
    }
  }

  ctx.nodes = out;
}

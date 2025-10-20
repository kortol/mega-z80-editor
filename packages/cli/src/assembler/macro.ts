import { AsmContext, SourcePos } from "./context";
import { Node, NodeMacroDef, NodeMacroInvoke, parse } from "./parser";
import { AssemblerErrorCode, makeError } from "./errors";
import { Token } from "./tokenizer";

function cloneTokensWithParent(tokens: Token[], parent: SourcePos): Token[] {
  // pos を複製して parent を付ける（既存 Token 型に pos がある前提）
  return tokens.map(t => ({
    ...t,
    pos: { file: t.pos.file, line: t.pos.line, column: t.pos.column, parent } as SourcePos
  }));
}

export function expandMacros(ctx: AsmContext): void {
  if (!ctx.nodes) return;

  const out: Node[] = [];
  ctx.expansionStack ??= [];

  // 定義表（cases-insensitive 対応）
  const getDef = (name: string): NodeMacroDef | undefined => {
    const key = ctx.caseInsensitive ? name.toUpperCase() : name;
    // ctx.nodes 内の macroDef も探す（analyze 前でも可）
    const def = ctx.nodes!.find(n => n.kind === "macroDef" &&
      (ctx.caseInsensitive
        ? (n as NodeMacroDef).name.toUpperCase() === key
        : (n as NodeMacroDef).name === name)) as NodeMacroDef | undefined;
    return def;
  };

  for (const n of ctx.nodes) {
    if (n.kind !== "macroInvoke") {
      out.push(n);
      continue;
    }

    const inv = n as NodeMacroInvoke;
    const def = getDef(inv.name);
    if (!def) {
      // 念のため（定義先行前提なので通常は来ない）
      ctx.errors.push(makeError(
        AssemblerErrorCode.SyntaxError,
        `Macro '${inv.name}' is not defined`,
        { pos: inv.pos }
      ));
      continue;
    }

    // 循環検知
    const key = ctx.caseInsensitive ? def.name.toUpperCase() : def.name;
    if (ctx.expansionStack.includes(key)) {
      ctx.errors.push(makeError(
        AssemblerErrorCode.ExprCircularRef,
        `Recursive macro expansion detected: ${def.name}`,
        { pos: inv.pos }
      ));
      continue;
    }

    ctx.expansionStack.push(key);
    try {
      // 呼び出し元を parent に付けて再パース
      const cloned = cloneTokensWithParent(def.bodyTokens, inv.pos);
      const expanded = parse(ctx, cloned);
      out.push(...expanded);
    } finally {
      ctx.expansionStack.pop();
    }
  }

  ctx.nodes = out;
}

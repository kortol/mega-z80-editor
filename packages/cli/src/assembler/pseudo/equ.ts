import { AsmContext } from "../context";
import { NodePseudo } from "../parser";
import { makeError, AssemblerErrorCode } from "../errors";
import { parseNumber } from "../tokenizer";

export function handleEQU(ctx: AsmContext, node: NodePseudo) {
  if (node.args.length !== 1) {
    throw new Error(`EQU requires two arguments at line ${node.line}`);
  }

  // PseudoArg形式: { key: "FOO", value: "10" }
  const key = node.args[0].key ?? "";
  const valStr = node.args[0].value ?? "";

  if (!key) {
    throw new Error(`EQU missing symbol name at line ${node.line}`);
  }
  // 大文字小文字処理
  let sym = ctx.caseInsensitive ? key.toUpperCase() : key;
  
  if (sym.length > ctx.modeSymLen) {
    const truncated = sym.substring(0, ctx.modeSymLen);
    ctx.warnings?.push?.(`Symbol '${sym}' truncated to '${truncated}'`);
    sym = truncated; // ← 登録キーを更新
  }

  const val = parseNumber(valStr);

  if (ctx.symbols.has(sym)) {
    const prev = ctx.symbols.get(sym);
    if (prev !== val) {
      ctx.errors.push(
        makeError(
          AssemblerErrorCode.RedefSymbol,
          `Redefinition of symbol '${sym}' at line ${node.line}`
        )
      );
      throw new Error(`Symbol '${sym}' redefined at line ${node.line}`);
    }
  }

  ctx.symbols.set(sym, val);
}

export function handleSYMLEN(ctx: AsmContext, node: NodePseudo) {
  const arg = node.args?.[0]?.value ?? "6";
  ctx.modeSymLen = parseInt(arg, 10);
}

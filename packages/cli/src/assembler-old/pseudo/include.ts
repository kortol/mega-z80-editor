import fs from "fs";
import path from "path";
import { tokenize } from "../tokenizer";
import { parse } from "../parser";
import { parsePeg } from "../../assembler/parser/pegAdapter";
import { AsmContext, cloneSourcePos, createSourcePos } from "../context";
import { AssemblerErrorCode, makeError, makeWarning } from "../errors";

// 🔹 パス解決（相対／INCLUDEPATH対応）
function resolveIncludePath(fileName: string, ctx: AsmContext): string | null {
  const baseDir = path.dirname(ctx.currentPos.file);
  const abs1 = path.resolve(baseDir, fileName);
  if (fs.existsSync(abs1)) return fs.realpathSync(abs1);

  if ((ctx as any).includePaths) {
    for (const dir of (ctx as any).includePaths as string[]) {
      const candidate = path.resolve(dir, fileName);
      if (fs.existsSync(candidate)) return fs.realpathSync(candidate);
    }
  }
  return null;
}

// 🔹 INCLUDEノード展開（仮想ファイル対応版）
export function handleInclude(ctx: AsmContext, node: any, recurse = false): any[] {
  const incName = node.args[0]?.value;
  if (!incName) {
    throw makeError(AssemblerErrorCode.IncludeSyntaxError, "INCLUDE expects a string literal");
  }

  const currentFile = node?.pos?.file ?? ctx.currentPos.file;
  let pushedCurrent = false;
  if (currentFile && !ctx.includeStack.some(f => f.file === currentFile)) {
    ctx.includeStack.push({ file: currentFile, lines: [node.pos.line] });
    pushedCurrent = true;
  }

  const usePeg = ctx.options?.parser === "peg";
  const parseSource = (src: string) => {
    if (usePeg) return parsePeg(ctx, src);
    const tokens = tokenize(ctx, src);
    return parse(ctx, tokens);
  };

  // 🟩 仮想ファイルシステム優先
  if (ctx.options.virtualFiles && ctx.options.virtualFiles.get(incName)) {
    ctx.logger?.info(`[include] virtual file: ${incName}`);
    const src = ctx.options.virtualFiles.get(incName) ?? '';

    // ✅ ソースキャッシュ登録
    if (!ctx.sourceMap) ctx.sourceMap = new Map<string, string[]>();
    ctx.sourceMap.set(incName, src.split(/\r?\n/));

    const parentPos = cloneSourcePos(node?.pos ?? ctx.currentPos);
    const newPos = createSourcePos(incName, 0, 0, ctx.phase, parentPos);
    ctx.currentPos = newPos;

    let subNodes = parseSource(src);

    if (recurse) {
      subNodes = expandIncludeNodes(ctx, subNodes);
    }

    // ✅ 子ノードの pos.parent に親を設定
    for (const n of subNodes) {
      if (n.pos && !n.pos.parent) {
        n.pos.parent = parentPos;
      }
    }

    ctx.currentPos = parentPos;
    if (pushedCurrent) ctx.includeStack.pop();
    return subNodes;
  }

  // --- 実ファイル読み込み（従来ロジック） ---
  const absPath = resolveIncludePath(incName, ctx);
  if (!absPath) {
    if (pushedCurrent) ctx.includeStack.pop();
    throw makeError(AssemblerErrorCode.IncludeNotFound, `File not found: ${incName}`);
  }

  // 循環検出
  if (ctx.includeStack.some(f => f.file === absPath)) {
    if (pushedCurrent) ctx.includeStack.pop();
    throw makeError(AssemblerErrorCode.IncludeLoop, `Circular include: ${absPath}`);
  }

  // 重複防止
  if (ctx.includeCache.has(absPath)) {
    ctx.warnings.push(
      makeWarning(
        AssemblerErrorCode.IncludeDuplicate,
        `Duplicate include skipped: ${absPath}`,
        { pos: ctx.currentPos }
      )
    );
    if (pushedCurrent) ctx.includeStack.pop();
    return [];
  }

  // if (ctx.verbose) {
  ctx.logger?.info(`ctx.currentFile:${ctx.currentPos.file}`);
  // }
  ctx.includeCache.add(absPath);

  const src = fs.readFileSync(absPath, "utf8");

  ctx.logger?.info(`include file:${absPath}`);
  ctx.logger?.info(`${src}`);
  // ✅ ソースキャッシュ登録
  if (!ctx.sourceMap) ctx.sourceMap = new Map<string, string[]>();
  ctx.sourceMap.set(absPath, src.split(/\r?\n/));

  ctx.includeStack.push({ file: absPath, lines: [node.pos.line] });

  try {
    // ✅ 現在位置を親として、新しい SourcePos を生成
    const parentPos = cloneSourcePos(node?.pos ?? ctx.currentPos);
    const newPos = createSourcePos(absPath, 0, 0, ctx.phase, parentPos);
    ctx.currentPos = newPos;

    let subNodes = parseSource(src);

    if (recurse) {
      subNodes = expandIncludeNodes(ctx, subNodes);
    }

    // ✅ 子ノードの pos.parent に親を設定
    for (const n of subNodes) {
      if (n.pos && !n.pos.parent) {
        n.pos.parent = parentPos;
      }
    }

    // ✅ 親に戻す
    ctx.currentPos = parentPos;
    return subNodes;
  } finally {
    ctx.includeStack.pop();
    if (pushedCurrent) ctx.includeStack.pop();
  }
}

function expandIncludeNodes(ctx: AsmContext, nodes: any[]): any[] {
  const out: any[] = [];
  for (const n of nodes) {
    if (n?.kind === "pseudo" && String(n.op).toUpperCase() === "INCLUDE") {
      const expanded = handleInclude(ctx, n, true);
      out.push(...expanded);
    } else {
      out.push(n);
    }
  }
  return out;
}

// section復帰は handlePseudo(INCLUDE) 側で復元ノードを挿入する

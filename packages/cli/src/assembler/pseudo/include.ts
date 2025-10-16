import fs from "fs";
import path from "path";
import { tokenize } from "../tokenizer";
import { parse } from "../parser";
import { AsmContext } from "../context";
import { AssemblerErrorCode, makeError } from "../errors";

// 🔹 パス解決（相対／INCLUDEPATH対応）
function resolveIncludePath(fileName: string, ctx: AsmContext): string | null {
  const baseDir = path.dirname(ctx.currentFile);
  const abs1 = path.resolve(baseDir, fileName);
  if (fs.existsSync(abs1)) return abs1;

  if ((ctx as any).includePaths) {
    for (const dir of (ctx as any).includePaths as string[]) {
      const candidate = path.resolve(dir, fileName);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// 🔹 INCLUDEノード展開
export function handleInclude(node: any, ctx: AsmContext): any[] {
  const incName = node.args[0]?.value;
  if (!incName) {
    throw makeError(AssemblerErrorCode.IncludeSyntaxError, "INCLUDE expects a string literal");
  }

  const absPath = resolveIncludePath(incName, ctx);
  if (!absPath) {
    throw makeError(AssemblerErrorCode.IncludeNotFound, `File not found: ${incName}`);
  }

  // 循環検出
  if (ctx.includeStack.some(f => f.file === absPath)) {
    throw makeError(AssemblerErrorCode.IncludeLoop, `Circular include: ${absPath}`);
  }

  // 重複防止
  if (ctx.includeCache.has(absPath)) {
    ctx.warnings.push(`Duplicate include skipped: ${absPath}`);
    return [];
  }

  ctx.includeCache.add(absPath);

  const src = fs.readFileSync(absPath, "utf8");

  ctx.includeStack.push({ file: absPath, line: node.line });

  try {
    const prevFile = ctx.currentFile;
    ctx.currentFile = absPath;

    const tokens = tokenize(src);
    const subNodes = parse(ctx, tokens);

    ctx.currentFile = prevFile;
    return subNodes;
  } finally {
    ctx.includeStack.pop();
  }

}

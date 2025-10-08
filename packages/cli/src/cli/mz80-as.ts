import { tokenize } from "../assembler/tokenizer";
import { parse } from "../assembler/parser";
import { encodeInstr } from "../assembler/encoder";
import { handlePseudo } from "../assembler/pseudo";
import { emitRel } from "../assembler/rel";
import { AsmContext } from "../assembler/context";
import * as fs from "fs";
import * as path from "path";

// --- 追加: 命令長の見積もり ---
function estimateSize(node: any): number {
  const op = node.op?.toUpperCase?.() ?? "";
  if (["JP", "CALL"].includes(op)) return 3;
  if (["JR", "DJNZ"].includes(op)) return 2;
  if (["RET", "NOP", "EXX"].includes(op)) return 1;
  if (op.startsWith("LD")) return 2; // 簡易
  return 1;
}

// --- 追加: .sym 出力 ---
function writeSymFile(ctx: AsmContext, outputFile: string) {
  const symPath = outputFile.replace(/\.rel$/i, ".sym");
  const lines: string[] = [];
  const entries = [...ctx.symbols.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [name, value] of entries) {
    const kind = ctx.externs.has(name)
      ? "EXTERN"
      : typeof value === "number"
        ? "LABEL"
        : "CONST";
    const valStr = typeof value === "number" ? value.toString(16).padStart(4, "0") : "----";
    lines.push(`${name.padEnd(8)} ${valStr.toUpperCase()}H ${kind}`);
  }
  fs.writeFileSync(symPath, lines.join("\n") + "\n", "utf-8");
}

// --- 追加: .lst 出力 ---
function writeLstFile(ctx: AsmContext, outputFile: string, source: string) {
  const lstPath = outputFile.replace(/\.rel$/i, ".lst");
  const lines: string[] = [];
  const srcLines = source.split(/\r?\n/);
  for (const t of ctx.texts) {
    const bytes = t.data.map(b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    const src = srcLines[(t.line ?? 1) - 1] ?? "";
    lines.push(`${t.addr.toString(16).padStart(4, "0")}  ${bytes.padEnd(12)}  ${src}`);
  }
  fs.writeFileSync(lstPath, lines.join("\n") + "\n", "utf-8");
}

// --- 本体 ---
export function assemble(
  inputFile: string,
  outputFile: string,
  pass: number,
  options?: { verbose?: boolean }
): AsmContext {
  const verbose = options?.verbose ?? false;
  const source = fs.readFileSync(inputFile, "utf-8");
  const tokens = tokenize(source);
  const nodes = parse(tokens);

  const ctx: AsmContext = {
    loc: 0,
    pass: 1, // ← 追加
    moduleName: path.basename(inputFile).replace(/\..*$/, "").toUpperCase(),
    symbols: new Map(),
    unresolved: [],
    modeWord32: false,
    modeSymLen: 6,
    caseInsensitive: true,
    texts: [],
    errors: [],
    externs: new Set(),
    options,
  };

  // ------------------------------------------------------------
  // PASS 1: シンボル収集
  // ------------------------------------------------------------
  for (const node of nodes) {
    if (node.kind === "label") {
      ctx.symbols.set(node.name, ctx.loc);
    } else if (node.kind === "pseudo") {
      handlePseudo(ctx, node);
    } else if (node.kind === "instr") {
      ctx.loc += estimateSize(node);
    }
  }

  // 1Pass指定のときはここで終了
  if (pass === 1) {
    return ctx;
  }

  // ------------------------------------------------------------
  // PASS 2: 実際のアセンブル
  // ------------------------------------------------------------
  ctx.pass = 2;
  ctx.loc = 0;
  ctx.texts = [];
  for (const node of nodes) {
    if (node.kind === "label") {
      ctx.symbols.set(node.name, ctx.loc);
    } else if (node.kind === "pseudo") {
      handlePseudo(ctx, node);
    } else if (node.kind === "instr") {
      encodeInstr(ctx, node);
    }
  }

  // ------------------------------------------------------------
  // 出力フェーズ
  // ------------------------------------------------------------
  const rel = emitRel(ctx);
  fs.writeFileSync(outputFile, rel, "utf-8");
  writeSymFile(ctx, outputFile);
  writeLstFile(ctx, outputFile, source);

  // ------------------------------------------------------------
  // Verbose出力
  // ------------------------------------------------------------
  if (verbose) {
    console.log("────────── Assembler Verbose Report ──────────");
    console.log(`Input : ${inputFile}`);
    console.log(`Output: ${outputFile}`);
    console.log(`Symbols: ${[...ctx.symbols.keys()].join(", ")}`);
    console.log(`Externs: ${[...ctx.externs.values()].join(", ") || "(none)"}`);
    console.log(`Errors : ${ctx.errors.length}`);
    console.log(`Texts  : ${ctx.texts.length} records`);
    console.log(`Output size: ${rel.length} bytes`);
    console.log("───────────────────────────────────────────────");

    if (ctx.errors.length > 0) {
      for (const e of ctx.errors) {
        console.log(`E${e.code ?? "----"}: ${e.message ?? "unknown"} (line ${e.line ?? "?"})`);
      }
    }
  }

  return ctx;
}

import { tokenize } from "../assembler/tokenizer";
import { Node, NodeInstr, parse } from "../assembler/parser";
import { encodeInstr, estimateInstrSize } from "../assembler/encoder";
import { handlePseudo } from "../assembler/pseudo";
import { emitRel } from "../assembler/rel";
import { AsmContext } from "../assembler/context";
import * as fs from "fs";
import * as path from "path";
import { emitRelV2 } from "../assembler/rel/builder";

// --- .sym 出力 ---
export function writeSymFile(ctx: AsmContext, outputFile: string) {
  const symPath = outputFile.replace(/\.rel$/i, ".sym");
  const lines: string[] = [];

  // シンボル名を集約：定義済み＋EXTERN
  const allNames = new Set<string>([
    ...ctx.symbols.keys(),
    ...ctx.externs.values(),
  ]);

  // ソートして安定出力
  const entries = [...allNames].sort((a, b) => a.localeCompare(b));

  for (const name of entries) {
    let kind = "UNKNOWN";
    let valStr = "----";

    if (ctx.externs.has(name)) {
      kind = "EXTERN";
    } else {
      const entry = ctx.symbols.get(name);
      if (typeof entry === "number") {
        kind = "LABEL";
        valStr = entry.toString(16).padStart(4, "0");
      }
    }

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
  options?: { verbose?: boolean, relVersion?: number }
): AsmContext {
  const verbose = options?.verbose ?? false;
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
    warnings: [],
    sections: new Map(),
    currentSection: 0,
    output: { relVersion: options?.relVersion ? options.relVersion : 1 },
  };

  // PASS 0 : トークン化と構文解析
  const source = fs.readFileSync(inputFile, "utf-8");
  const tokens = tokenize(source);
  const nodes = parse(tokens);
  ctx.source = source;
  ctx.tokens = tokens;
  ctx.nodes = nodes;

  // ------------------------------------------------------------
  // PASS 1: シンボル収集
  // ------------------------------------------------------------
  assemblePhase1(ctx);

  // 1Pass指定のときはここで終了
  if (pass === 1) {
    return ctx;
  }

  // ------------------------------------------------------------
  // PASS 2: 実際のアセンブル
  // ------------------------------------------------------------
  assemblePhase2(ctx);

  // ------------------------------------------------------------
  // 出力フェーズ
  // ------------------------------------------------------------
  const relVersion = options?.relVersion ?? 1;
  if (relVersion === 2) {
    // v2 Writer 経由で出力
    emitRelV2(ctx, outputFile);
  } else {
    const rel = emitRel(ctx); // 従来どおり
    fs.writeFileSync(outputFile, rel, "utf-8");
    ctx.output.relSize = rel.length;
    ctx.output.relVersion = 1;
    ctx.output.generatedAt = new Date();
  }

  // 共通：SYM / LST 出力
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
    console.log(`Output size: ${ctx.output.relSize} bytes`);
    console.log("───────────────────────────────────────────────");

    if (ctx.errors.length > 0) {
      for (const e of ctx.errors) {
        console.log(`E${e.code ?? "----"}: ${e.message ?? "unknown"} (line ${e.line ?? "?"})`);
      }
    }
  }
  return ctx;
}

function assemblePhase1(ctx: AsmContext) {
  const nodes = ctx.nodes ?? [];
  ctx.pass = 1;
  ctx.loc = 0;
  ctx.texts = [];
  for (const node of nodes) {
    if (node.kind === "label") {
      ctx.symbols.set(node.name, ctx.loc);
    } else if (node.kind === "pseudo") {
      handlePseudo(ctx, node);
    } else if (node.kind === "instr") {
      ctx.loc += estimateInstrSize(ctx, node);
    }
  }
}

function assemblePhase2(ctx: AsmContext) {
  const nodes = ctx.nodes ?? [];
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
}


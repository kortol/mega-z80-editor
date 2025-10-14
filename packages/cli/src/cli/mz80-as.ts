import { tokenize } from "../assembler/tokenizer";
import { Node, NodeInstr, parse } from "../assembler/parser";
import { encodeInstr, estimateInstrSize } from "../assembler/encoder";
import { handlePseudo } from "../assembler/pseudo";
import { emitRel } from "../assembler/rel";
import { AsmContext, createContext } from "../assembler/context";
import * as fs from "fs";
import * as path from "path";
import { emitRelV2 } from "../assembler/rel/builder";
import { initCodegen } from "../assembler/codegen/emit";
import { setPhase } from "../assembler/phaseManager";
import { console } from "inspector";
import { Logger } from "../logger";

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

  // emit順を保証
  const texts = [...ctx.texts].sort((a, b) => a.addr - b.addr);

  for (const t of texts) {
    const bytes = t.data
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");

    // --- line補完（undefined対策） ---
    const lineNo = t.line && t.line > 0 ? t.line : 1;
    const src = srcLines[lineNo - 1]?.trim() ?? "";

    lines.push(
      `${t.addr.toString(16).padStart(4, "0").toUpperCase()}  ${bytes.padEnd(12)}  ${src}`
    );
  }

  fs.writeFileSync(lstPath, lines.join("\n") + "\n", "utf-8");
}

// --- 本体 ---
export function assemble(
  logger: Logger,
  inputFile: string,
  outputFile: string,
  options?: { verbose?: boolean; relVersion?: number }
): AsmContext {
  const verbose = options?.verbose ?? false;
  const ctx = createContext({
    moduleName: path.basename(inputFile).replace(/\..*$/, "").toUpperCase(),
    output: { relVersion: options?.relVersion ?? 1 },
    verbose,
    inputFile,
    logger,
  });
  initCodegen(ctx, { withDefaultSections: true });
  // とりあえずデバッグモード
  ctx.logger?.setDebugMode(verbose);

  // PASS 0 : トークン化と構文解析
  const source = fs.readFileSync(inputFile, "utf-8");

  // --- PHASE: tokenize ---
  setPhase(ctx, "tokenize");
  ctx.tokens = tokenize(source);

  // --- PHASE: parse ---
  setPhase(ctx, "parse");
  ctx.nodes = parse(ctx.tokens);
  ctx.source = source;

  // --- PHASE: analyze ---
  setPhase(ctx, "analyze");
  runAnalyze(ctx);

  // --- PHASE: emit ---
  setPhase(ctx, "emit");
  runEmit(ctx);

  // --- PHASE: link（内部リンク相当） ---
  setPhase(ctx, "link");
  finalizeOutput(ctx, outputFile, options?.relVersion ?? 1);

  return ctx;
}

export function runAnalyze(ctx: AsmContext) {
  ctx.loc = 0;
  for (const node of ctx.nodes ?? []) {
    switch (node.kind) {
      case "label":
        ctx.symbols.set(node.name, ctx.loc);
        break;
      case "pseudo":
        handlePseudo(ctx, node);  // EQU などはここで確定
        break;
      case "instr":
        ctx.loc += estimateInstrSize(ctx, node);
        break;
    }
  }
}

export function runEmit(ctx: AsmContext) {
  ctx.loc = 0;
  for (const sec of ctx.sections.values()) {
    sec.lc = 0;
    sec.bytes = [];
  }

  for (const node of ctx.nodes ?? []) {
    switch (node.kind) {
      case "label":
        ctx.symbols.set(node.name, ctx.loc);
        break;
      case "pseudo":
        handlePseudo(ctx, node);
        break;
      case "instr":
        encodeInstr(ctx, node);
        break;
    }
  }
}

// ------------------------------------------------------------
// 出力フェーズ
// ------------------------------------------------------------
export function finalizeOutput(ctx: AsmContext, outputFile: string, relVersion: number) {
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
  writeLstFile(ctx, outputFile, ctx.source ?? '');

  // ------------------------------------------------------------
  // Verbose出力
  // ------------------------------------------------------------
  if (ctx.verbose) {
    ctx.logger?.info("────────── Assembler Verbose Report ──────────");
    ctx.logger?.info(`Input : ${ctx.inputFile}`);
    ctx.logger?.info(`Output: ${outputFile}`);
    ctx.logger?.info(`Symbols: ${[...ctx.symbols.keys()].join(", ")}`);
    ctx.logger?.info(`Externs: ${[...ctx.externs.values()].join(", ") || "(none)"}`);
    ctx.logger?.info(`Errors : ${ctx.errors.length}`);
    ctx.logger?.info(`Texts  : ${ctx.texts.length} records`);
    ctx.logger?.info(`Output size: ${ctx.output.relSize} bytes`);
    ctx.logger?.info("───────────────────────────────────────────────");

    if (ctx.errors.length > 0) {
      for (const e of ctx.errors) {
        ctx.logger?.info(
          `E${e.code ?? "----"}: ${e.message ?? "unknown"} (line ${e.line ?? "?"
          })`
        );
      }
    }
  }
  return ctx;
}

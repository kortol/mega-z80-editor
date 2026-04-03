import { tokenize } from "../assembler-old/tokenizer";
import { parse } from "../assembler-old/parser";
import { encodeInstr, estimateInstrSize } from "../assembler-old/encoder";
import { handlePseudo } from "../assembler-old/pseudo";
import { emitRel } from "../assembler-old/rel";
import { AsmContext, AsmOptions, createContext, defineSymbol } from "../assembler-old/context";
import * as fs from "fs";
import * as path from "path";
import { emitRelV2 } from "../assembler-old/rel/builder";
import { initCodegen } from "../assembler-old/codegen/emit";
import { setPhase } from "../assembler-old/phaseManager";
import { Logger } from "../logger";
import { writeLstFile, writeLstFileV2 } from "../assembler-old/output/listing";
import { runAnalyze } from "../assembler-old/analyze";
import { expandMacros } from "../assembler-old/macro";
import { parsePeg } from "../assembler/parser/pegAdapter";
import { handleConditional, isConditionActive, isConditionalOp } from "../assembler-old/pseudo/conditional";

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
    let fileStr = "-";

    if (ctx.externs.has(name)) {
      kind = "EXTERN";
    } else {
      const entry = ctx.symbols.get(name);
      if (typeof (entry?.value) === "number") {
        kind = "LABEL";
        valStr = entry.value.toString(16).padStart(4, "0");
        if (entry?.pos?.file) fileStr = path.basename(entry.pos.file);
      }
    }

    lines.push(`${name.padEnd(8)} ${valStr.toUpperCase()}H ${kind} ${fileStr}`);
  }

  fs.writeFileSync(symPath, lines.join("\n") + "\n", "utf-8");
}

// // --- 追加: .lst 出力 ---
// function writeLstFile(ctx: AsmContext, outputFile: string, source: string) {
//   const lstPath = outputFile.replace(/\.rel$/i, ".lst");
//   const lines: string[] = [];
//   const srcLines = source.split(/\r?\n/);

//   // emit順を保証
//   const texts = [...ctx.texts].sort((a, b) => a.addr - b.addr);

//   for (const t of texts) {
//     const bytes = t.data
//       .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
//       .join(" ");

//     // --- line補完（undefined対策） ---
//     const lineNo = t.line && t.line > 0 ? t.line : 1;
//     const src = srcLines[lineNo - 1]?.trim() ?? "";

//     lines.push(
//       `${t.addr.toString(16).padStart(4, "0").toUpperCase()}  ${bytes.padEnd(12)}  ${src}`
//     );
//   }

//   fs.writeFileSync(lstPath, lines.join("\n") + "\n", "utf-8");
// }

// --- 本体 ---
export function assemble(
  logger: Logger,
  inputFile: string,
  outputFile: string,
  options: AsmOptions,
): AsmContext {
  const verbose = options.verbose ?? false;
  const ctx = createContext({
    moduleName: path.basename(inputFile).replace(/\..*$/, "").toUpperCase(),
    output: { relVersion: options.relVersion ?? 1 },
    verbose,
    inputFile,
    logger,
    options,
  });
  initCodegen(ctx, { withDefaultSections: true });

  // PASS 0 : トークン化と構文解析
  const source = fs.readFileSync(inputFile, "utf-8");
  ctx.currentPos.file = inputFile;
  ctx.currentPos.line = 0;
  ctx.sourceMap.set(inputFile, source.split(/\r?\n/));

  // --- PHASE: tokenize ---
  setPhase(ctx, "tokenize");
  if (options.parser === "peg") {
    ctx.tokens = [];
  } else {
    ctx.tokens = tokenize(ctx, source);
  }

  // --- PHASE: parse ---
  setPhase(ctx, "parse");
  if (options.parser === "peg") {
    ctx.nodes = parsePeg(ctx, source);
  } else {
    ctx.nodes = parse(ctx, ctx.tokens);
  }
  ctx.source = source;

  // --- 🧩 PHASE: macro-expand (P2-E-03) ---
  setPhase(ctx, "macroExpand");
  expandMacros(ctx);             // ← ここを追加！

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

// export function runAnalyze(ctx: AsmContext) {
//   ctx.loc = 0;
//   for (const node of ctx.nodes ?? []) {
//     switch (node.kind) {
//       case "label":
//         defineSymbol(ctx, node.name, ctx.loc, "LABEL");
//         break;
//       case "pseudo":
//         handlePseudo(ctx, node);  // EQU などはここで確定
//         break;
//       case "instr":
//         ctx.loc += estimateInstrSize(ctx, node);
//         break;
//     }
//   }
// }

export function runEmit(ctx: AsmContext) {
  ctx.loc = 0;
  ctx.relocs = [];
  ctx.unresolved = [];
  ctx.condStack = [];
  ctx.listing = [];
  for (const sec of ctx.sections.values()) {
    sec.lc = 0;
    sec.bytes = [];
  }

  for (const node of ctx.nodes ?? []) {
    if (node.kind === "empty") continue;
    const beforeTexts = ctx.texts.length;
    const addr = ctx.loc;
    const sectionId = ctx.currentSection;
    let skipListing = false;

    switch (node.kind) {
      case "label":
        if (!isConditionActive(ctx)) { skipListing = true; break; }
        defineSymbol(ctx, node.name, ctx.loc, "LABEL", node.pos);
        break;
      case "pseudo":
        if (isConditionalOp(node.op)) {
          handleConditional(ctx, node);
          skipListing = true;
          break;
        }
        if (!isConditionActive(ctx)) { skipListing = true; break; }
        const pseudoOp = node.op.toUpperCase();
        if (pseudoOp === "INCLUDE" || pseudoOp === "SECTION") {
          skipListing = true;
        }
        handlePseudo(ctx, node);
        break;
      case "instr":
        if (!isConditionActive(ctx)) { skipListing = true; break; }
        encodeInstr(ctx, node);
        break;
    }

    if (skipListing) continue;

    const newTexts = ctx.texts.slice(beforeTexts);
    if (newTexts.length > 0) {
      for (const t of newTexts) {
        ctx.listing.push({
          addr: t.addr,
          bytes: t.data,
          pos: t.pos,
          sectionId: t.sectionId,
        });
      }
      continue;
    }

    // no bytes emitted -> listing entry for label/pseudo
    if (node.kind === "label") {
      ctx.listing.push({
        addr,
        bytes: [],
        pos: node.pos,
        sectionId,
        text: `${node.name}:`,
        kind: "label",
      });
    } else if (node.kind === "pseudo") {
      ctx.listing.push({
        addr,
        bytes: [],
        pos: node.pos,
        sectionId,
        kind: "pseudo",
      });
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

  // SYM 出力
  writeSymFile(ctx, outputFile);

  ctx.logger?.info(`relVersion:${relVersion}`);
  // LST 出力
  if (relVersion === 2) {
    writeLstFileV2(ctx, outputFile, ctx.source ?? '');
  } else {
    writeLstFile(ctx, outputFile, ctx.source ?? '');
  }

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
          `E${e.code ?? "----"}: ${e.message ?? "unknown"} (line ${e.pos?.line ?? "?"
          })`
        );
      }
    }
  }
  return ctx;
}

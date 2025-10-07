import { tokenize } from "../assembler/tokenizer";
import { parse } from "../assembler/parser";
import { encodeInstr } from "../assembler/encoder";
import { handlePseudo } from "../assembler/pseudo";
import { emitRel } from "../assembler/rel";
import { AsmContext } from "../assembler/context";
import * as fs from "fs";

export function assemble(
  inputFile: string,
  outputFile: string,
  options?: { verbose?: boolean }
): AsmContext {
  const verbose = options?.verbose ?? false;
  const source = fs.readFileSync(inputFile, "utf-8");
  const tokens = tokenize(source);
  const nodes = parse(tokens);

  const ctx: AsmContext = {
    loc: 0,
    moduleName: inputFile.replace(/\..*$/, "").toUpperCase(),
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

  for (const node of nodes) {
    if (node.kind === "instr") {
      encodeInstr(ctx, node);
    } else if (node.kind === "pseudo") {
      handlePseudo(ctx, node);
    } else if (node.kind === "label") {
      ctx.symbols.set(node.name, ctx.loc);
    }
  }

  const rel = emitRel(ctx);
  fs.writeFileSync(outputFile, rel, "utf-8");

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

    if (ctx.options?.verbose) {
      for (const e of ctx.errors) {
        console.log(`E${e.code}: ${e.message} (line ${e.line})`);
      }
    }
  }
  return ctx;
}

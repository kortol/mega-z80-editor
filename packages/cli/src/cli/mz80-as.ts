// src/cli/mz80-as.ts
import { tokenize } from "../assembler/tokenizer";
import { parse } from "../assembler/parser";
import { encodeInstr } from "../assembler/encoder";
import { handlePseudo } from "../assembler/pseudo";
import { emitRel } from "../assembler/rel";
import { AsmContext } from "../assembler/context";
import * as fs from "fs";

export function assemble(inputFile: string, outputFile: string) {
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
}

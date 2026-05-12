import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDocument } from "vscode-languageserver-textdocument";

export type SourcePosLike = {
  file: string;
  line: number;
  column?: number;
  phase?: string;
};

export type AssemblerErrorLike = {
  code?: string;
  message: string;
  pos?: SourcePosLike;
};

export type AsmTokenLike = {
  kind: string;
  text: string;
  pos: SourcePosLike;
};

export type ParsedNodeLike =
  | {
      kind: "label";
      name: string;
      pos: SourcePosLike;
    }
  | {
      kind: "macroDef";
      name: string;
      params?: Array<{ name: string }>;
      pos: SourcePosLike;
    }
  | {
      kind: "macroInvoke";
      name: string;
      pos: SourcePosLike;
    }
  | {
      kind: "pseudo";
      op: string;
      args?: Array<{ key?: string; value: string }>;
      pos: SourcePosLike;
    }
  | {
      kind: "instr";
      op: string;
      args?: string[];
      pos: SourcePosLike;
    }
  | {
      kind: "macroLoop";
      op: string;
      pos: SourcePosLike;
    }
  | {
      kind: "empty";
      pos: SourcePosLike;
    };

export type AsmContextLike = {
  inputFile: string;
  moduleName?: string;
  source?: string;
  nodes?: ParsedNodeLike[];
  tokens?: AsmTokenLike[];
  logger?: {
    info?: (...args: unknown[]) => void;
    debug?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
  errors: AssemblerErrorLike[];
  warnings: AssemblerErrorLike[];
  symbols: Map<string, unknown>;
  externs: Set<string>;
  options: {
    includePaths?: string[];
    virtualFiles?: Map<string, string>;
    caseSensitive?: boolean;
  };
  currentPos: SourcePosLike;
  sourceMap: Map<string, string[]>;
};

export type AsmPipeline = {
  ctx: AsmContextLike;
  inputFile: string;
  source: string;
  parsedNodes: ParsedNodeLike[];
  tokens: AsmTokenLike[];
};

const { createAsmContext } = require("../../../packages/cli/dist/assembler/context.js") as {
  createAsmContext: (overrides?: Partial<AsmContextLike>) => AsmContextLike;
};
const { tokenize } = require("../../../packages/cli/dist/assembler/tokenizer.js") as {
  tokenize: (ctx: AsmContextLike, source: string) => AsmTokenLike[];
};
const { parsePeg } = require("../../../packages/cli/dist/assembler/parser/pegAdapter.js") as {
  parsePeg: (ctx: AsmContextLike, source: string) => ParsedNodeLike[];
};
const { expandMacros } = require("../../../packages/cli/dist/assembler/macro.js") as {
  expandMacros: (ctx: AsmContextLike) => void;
};
const { runAnalyze } = require("../../../packages/cli/dist/assembler/analyze.js") as {
  runAnalyze: (ctx: AsmContextLike) => void;
};
const { initCodegen } = require("../../../packages/cli/dist/assembler/codegen/emit.js") as {
  initCodegen: (ctx: AsmContextLike, options?: { withDefaultSections?: boolean }) => void;
};
const { setPhase } = require("../../../packages/cli/dist/assembler/phaseManager.js") as {
  setPhase: (ctx: AsmContextLike, next: string) => void;
};
const { runEmit } = require("../../../packages/cli/dist/cli/mz80-as.js") as {
  runEmit: (ctx: AsmContextLike) => void;
};

export const silentLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
};

export function documentUriToInputFile(uri: string): string {
  if (!uri.startsWith("file:")) return uri;
  try {
    return fileURLToPath(uri);
  } catch {
    return uri;
  }
}

export function createPipeline(document: TextDocument): AsmPipeline {
  const inputFile = documentUriToInputFile(document.uri);
  const source = document.getText();
  const includePaths = inputFile.includes(":") || inputFile.startsWith("\\")
    ? [dirname(inputFile)]
    : [];
  const ctx = createAsmContext({
    inputFile,
    moduleName: basename(inputFile).replace(/\..*$/u, "").toUpperCase() || "LSP",
    logger: silentLogger,
    currentPos: {
      file: inputFile,
      line: 0,
      column: 0,
      phase: "tokenize",
    },
    options: {
      includePaths,
      virtualFiles: new Map([[inputFile, source]]),
    },
  });

  initCodegen(ctx, { withDefaultSections: true });
  ctx.source = source;
  ctx.sourceMap.set(inputFile, source.split(/\r?\n/u));

  setPhase(ctx, "tokenize");
  ctx.tokens = tokenize(ctx, source);
  const tokens = [...ctx.tokens];

  setPhase(ctx, "parse");
  ctx.nodes = parsePeg(ctx, source);
  const parsedNodes = [...ctx.nodes];

  return {
    ctx,
    inputFile,
    source,
    parsedNodes,
    tokens,
  };
}

export function runAnalysis(pipeline: AsmPipeline): void {
  const { ctx } = pipeline;
  setPhase(ctx, "macroExpand");
  expandMacros(ctx);
  setPhase(ctx, "analyze");
  runAnalyze(ctx);
}

export function runEmitPass(pipeline: AsmPipeline): void {
  const { ctx } = pipeline;
  setPhase(ctx, "emit");
  runEmit(ctx);
}

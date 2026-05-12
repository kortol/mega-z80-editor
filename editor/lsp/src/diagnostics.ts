import { Diagnostic, DiagnosticSeverity, Range } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  AsmContextLike,
  AssemblerErrorLike,
  SourcePosLike,
  createPipeline,
  runAnalysis,
  runEmitPass,
} from "./asmPipeline";

function clampRange(document: TextDocument, pos?: SourcePosLike): Range {
  if (!pos) {
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    };
  }

  const lineCount = Math.max(1, document.lineCount);
  const line = Math.max(0, Math.min(pos.line ?? 0, lineCount - 1));
  const lineText = document.getText({
    start: { line, character: 0 },
    end: { line: Math.min(line + 1, lineCount), character: 0 },
  });
  const maxChar = Math.max(0, lineText.replace(/[\r\n]+$/u, "").length);
  const startChar = Math.max(0, Math.min(pos.column ?? 0, maxChar));
  const endChar = Math.min(maxChar, startChar + 1);

  return {
    start: { line, character: startChar },
    end: { line, character: endChar > startChar ? endChar : startChar + 1 },
  };
}

function toDiagnostic(
  document: TextDocument,
  err: AssemblerErrorLike,
  severity: DiagnosticSeverity
): Diagnostic {
  return {
    severity,
    range: clampRange(document, err.pos),
    message: err.message,
    source: "mz80",
    code: err.code,
  };
}

function toUnexpectedDiagnostic(document: TextDocument, err: unknown): Diagnostic {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? String((err as { message?: unknown }).message)
        : String(err);
  const pos =
    typeof err === "object" && err && "pos" in err
      ? (err as { pos?: SourcePosLike }).pos
      : undefined;
  return toDiagnostic(document, { message, pos }, DiagnosticSeverity.Error);
}

function sameDiagnosticKey(err: AssemblerErrorLike): string {
  const file = err.pos?.file ?? "";
  const line = err.pos?.line ?? -1;
  const column = err.pos?.column ?? -1;
  return [err.code ?? "", err.message, file, line, column].join("|");
}

function collectNewDiagnostics(
  previous: AssemblerErrorLike[],
  current: AssemblerErrorLike[],
  filter?: (err: AssemblerErrorLike) => boolean
): AssemblerErrorLike[] {
  const seen = new Set(previous.map(sameDiagnosticKey));
  return current.filter((err) => {
    if (seen.has(sameDiagnosticKey(err))) return false;
    return filter ? filter(err) : true;
  });
}

function isEmitRedefinitionNoise(err: AssemblerErrorLike): boolean {
  return err.code === "A3102" || err.message.startsWith("Symbol redefined:");
}

function maybeForwardReference(ctx: AsmContextLike, err: AssemblerErrorLike): boolean {
  if (err.code !== "A2100") return false;
  const match = /^Undefined symbol: (.+)$/u.exec(err.message);
  if (!match) return false;
  const raw = match[1].trim();
  const key = ctx.options.caseSensitive ? raw : raw.toUpperCase();
  return ctx.symbols.has(key) || ctx.externs.has(key);
}

export function collectDiagnostics(document: TextDocument): Diagnostic[] {
  const pipeline = createPipeline(document);
  const { ctx } = pipeline;

  try {
    runAnalysis(pipeline);
    ctx.errors = ctx.errors.filter((err) => !maybeForwardReference(ctx, err));
    const analyzeErrors = [...ctx.errors];
    const analyzeWarnings = [...ctx.warnings];
    runEmitPass(pipeline);

    const emitErrors = collectNewDiagnostics(
      analyzeErrors,
      ctx.errors,
      (err) => !maybeForwardReference(ctx, err)
    );
    const emitWarnings = collectNewDiagnostics(
      analyzeWarnings,
      ctx.warnings,
      (err) => !isEmitRedefinitionNoise(err)
    );

    return [
      ...analyzeErrors.map((err) => toDiagnostic(document, err, DiagnosticSeverity.Error)),
      ...emitErrors.map((err) => toDiagnostic(document, err, DiagnosticSeverity.Error)),
      ...analyzeWarnings.map((warn) => toDiagnostic(document, warn, DiagnosticSeverity.Warning)),
      ...emitWarnings.map((warn) => toDiagnostic(document, warn, DiagnosticSeverity.Warning)),
    ];
  } catch (err) {
    return [toUnexpectedDiagnostic(document, err)];
  }
}

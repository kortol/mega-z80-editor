export type TsDiagnostic = {
  message: string;
  file?: string;
  offset?: number;
  line: number;
  column: number;
};

export class TsFrontendError extends Error {
  readonly diagnostics: TsDiagnostic[];

  constructor(diagnostics: TsDiagnostic[]) {
    super(formatDiagnostics(diagnostics));
    this.name = "TsFrontendError";
    this.diagnostics = diagnostics;
  }
}

export function createDiagnostic(sourceText: string, message: string, opts: {
  file?: string;
  offset?: number;
} = {}): TsDiagnostic {
  const offset = clampOffset(sourceText, opts.offset ?? 0);
  const { line, column } = computeLineColumn(sourceText, offset);
  return {
    message,
    file: opts.file,
    offset,
    line,
    column,
  };
}

export function throwDiagnostic(sourceText: string, message: string, opts: {
  file?: string;
  offset?: number;
} = {}): never {
  throw new TsFrontendError([createDiagnostic(sourceText, message, opts)]);
}

export function formatDiagnostic(diagnostic: TsDiagnostic): string {
  const location = diagnostic.file
    ? `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`
    : `${diagnostic.line}:${diagnostic.column}`;
  return `${location}: ${diagnostic.message}`;
}

export function formatDiagnostics(diagnostics: TsDiagnostic[]): string {
  return diagnostics.map(formatDiagnostic).join("\n");
}

function computeLineColumn(sourceText: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset; index += 1) {
    if (sourceText[index] === "\n") {
      line += 1;
      column = 1;
      continue;
    }
    column += 1;
  }
  return { line, column };
}

function clampOffset(sourceText: string, offset: number): number {
  if (offset < 0) {
    return 0;
  }
  if (offset > sourceText.length) {
    return sourceText.length;
  }
  return offset;
}

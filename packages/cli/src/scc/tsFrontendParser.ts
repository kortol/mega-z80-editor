import {
  AdditiveOp,
  BitwiseOp,
  BinaryOp,
  CompareOp,
  LogicalOp,
  MultiplicativeOp,
  ScalarType,
  ShiftOp,
  SourceBlock,
  SourceExpr,
  SourceFunction,
  SourceForInit,
  SourceLocalDecl,
  SourceParam,
  SourceProgram,
  SourceSimpleStmt,
  SourceStmt,
  SourceType,
} from "./tsFrontendAst";
import { throwDiagnostic } from "./tsFrontendDiagnostics";

type ParseContext = {
  file?: string;
  normalized: string;
};

const BINARY_PRECEDENCE: ReadonlyArray<{
  ops: readonly BinaryOp[];
}> = [
  { ops: ["||"] },
  { ops: ["&&"] },
  { ops: ["|"] },
  { ops: ["^"] },
  { ops: ["&"] },
  { ops: ["==", "!=", ">=", "<=", ">", "<"] },
  { ops: ["<<", ">>"] },
  { ops: ["+", "-"] },
  { ops: ["*", "/", "%"] },
];

export function parseProgram(sourceText: string, file?: string): SourceProgram {
  const normalized = stripLineComments(sourceText);
  const context: ParseContext = { file, normalized };
  const functions: SourceFunction[] = [];
  const headerPattern = /\b(int|char)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(normalized)) !== null) {
    const bodyStart = headerPattern.lastIndex;
    const bodyEnd = findMatchingBraceIndex(context, bodyStart - 1);
    const bodyText = normalized.slice(bodyStart, bodyEnd);
    functions.push({
      kind: "function",
      name: match[2],
      returnType: makeScalarType(match[1] as ScalarType),
      params: parseParams(context, match[3], match[2], match.index),
      body: parseBodyAsBlock(context, bodyText, match[2], bodyStart),
    });
    headerPattern.lastIndex = bodyEnd + 1;
  }
  if (functions.length === 0) {
    throwDiagnostic(
      sourceText,
      "TsSccCompilerAdapter Phase C subset could not find any supported function definitions.",
      { file, offset: 0 },
    );
  }
  return {
    kind: "program",
    functions,
  };
}

export function stripLineComments(sourceText: string): string {
  return sourceText.replace(/\/\/.*$/gm, "");
}

function parseBodyAsBlock(
  context: ParseContext,
  bodyText: string,
  functionName: string,
  startOffset: number,
): SourceBlock {
  const trimmed = bodyText.trim();
  if (trimmed.length === 0) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset found no executable statements in ${functionName}().`, {
      file: context.file,
      offset: startOffset,
    });
  }
  return parseStatementSequence(context, trimmed, functionName, startOffset);
}

function parseStatementSequence(
  context: ParseContext,
  bodyText: string,
  functionName: string,
  startOffset: number,
): SourceBlock {
  const declarations: SourceLocalDecl[] = [];
  const statements: SourceStmt[] = [];
  for (const { text, offset } of splitTopLevelStatements(context, bodyText, startOffset)) {
    const parsed = parseStatement(context, text, functionName, offset);
    if (parsed.kind === "decl") {
      declarations.push(parsed.declaration);
      if (parsed.declaration.initializer) {
        statements.push({
          kind: "assign",
          name: parsed.declaration.name,
          expr: parsed.declaration.initializer,
        });
      }
      continue;
    }
    statements.push(parsed.statement);
  }
  if (statements.length === 0) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset found no executable statements in ${functionName}().`, {
      file: context.file,
      offset: startOffset,
    });
  }
  return {
    kind: "block",
    declarations,
    statements,
  };
}

function parseStatement(
  context: ParseContext,
  statementText: string,
  functionName: string,
  offset: number,
): { kind: "stmt"; statement: SourceStmt } | { kind: "decl"; declaration: SourceLocalDecl } {
  if (/^if\b/.test(statementText)) {
    return { kind: "stmt", statement: parseIfStmt(context, statementText, functionName, offset) };
  }
  if (/^while\b/.test(statementText)) {
    return { kind: "stmt", statement: parseWhileStmt(context, statementText, functionName, offset) };
  }
  if (/^for\b/.test(statementText)) {
    return { kind: "stmt", statement: parseForStmt(context, statementText, functionName, offset) };
  }
  if (statementText.trim() === "break") {
    return { kind: "stmt", statement: { kind: "break" } };
  }
  if (statementText.trim() === "continue") {
    return { kind: "stmt", statement: { kind: "continue" } };
  }
  const declaration = parseDeclaration(statementText);
  if (declaration) {
    return {
      kind: "decl",
      declaration: {
        kind: "localDecl",
        name: declaration.name,
        type: makeScalarType(declaration.type),
        initializer: declaration.initializer
          ? parseExpression(context, declaration.initializer, functionName, offset + statementText.indexOf(declaration.initializer))
          : undefined,
      },
    };
  }
  const assignMatch = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(statementText);
  if (assignMatch) {
    return {
      kind: "stmt",
      statement: {
        kind: "assign",
        name: assignMatch[1],
        expr: parseExpression(context, assignMatch[2], functionName, offset + statementText.indexOf(assignMatch[2])),
      },
    };
  }
  const returnMatch = /^return\s+(.+)$/.exec(statementText);
  if (returnMatch) {
    return {
      kind: "stmt",
      statement: {
        kind: "return",
        expr: parseExpression(context, returnMatch[1], functionName, offset + statementText.indexOf(returnMatch[1])),
      },
    };
  }
  const exprStmt = parseExpressionStatement(context, statementText, functionName, offset);
  if (exprStmt) {
    return {
      kind: "stmt",
      statement: exprStmt,
    };
  }
  throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset does not support statement '${statementText}' in ${functionName}().`, {
    file: context.file,
    offset,
  });
}

function parseIfStmt(context: ParseContext, statementText: string, functionName: string, offset: number): SourceStmt {
  const trimmed = statementText.trim();
  if (!trimmed.startsWith("if")) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset could not parse if statement in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const condOpen = trimmed.indexOf("(");
  if (condOpen < 0) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset could not parse if condition in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const condClose = findMatchingParenInText(trimmed, condOpen);
  const conditionText = trimmed.slice(condOpen + 1, condClose);
  let rest = trimmed.slice(condClose + 1).trim();
  const thenOffset = offset + trimmed.indexOf(rest);
  const thenParsed = parseBranch(context, rest, functionName, thenOffset);
  rest = thenParsed.remainder.trim();

  let elseBlock: SourceBlock | undefined;
  if (rest.startsWith("else")) {
    const elseRest = rest.slice(4).trim();
    const elseOffset = offset + trimmed.lastIndexOf(elseRest);
    if (elseRest.startsWith("if")) {
      const elseStmt = parseIfStmt(context, elseRest, functionName, elseOffset);
      elseBlock = { kind: "block", declarations: [], statements: [elseStmt] };
    } else {
      elseBlock = parseStandaloneBranch(context, elseRest, functionName, elseOffset);
    }
  }

  return {
    kind: "if",
    condition: parseExpression(context, conditionText, functionName, offset + condOpen + 1),
    thenBlock: thenParsed.block,
    elseBlock,
  };
}

function parseWhileStmt(context: ParseContext, statementText: string, functionName: string, offset: number): SourceStmt {
  const trimmed = statementText.trim();
  const condOpen = trimmed.indexOf("(");
  if (!trimmed.startsWith("while") || condOpen < 0) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset could not parse while statement in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const condClose = findMatchingParenInText(trimmed, condOpen);
  const conditionText = trimmed.slice(condOpen + 1, condClose);
  const bodyText = trimmed.slice(condClose + 1).trim();
  const bodyOffset = offset + trimmed.indexOf(bodyText);
  return {
    kind: "while",
    condition: parseExpression(context, conditionText, functionName, offset + condOpen + 1),
    body: parseStandaloneBranch(context, bodyText, functionName, bodyOffset),
  };
}

function parseForStmt(context: ParseContext, statementText: string, functionName: string, offset: number): SourceStmt {
  const trimmed = statementText.trim();
  const condOpen = trimmed.indexOf("(");
  if (!trimmed.startsWith("for") || condOpen < 0) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset could not parse for statement in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const condClose = findMatchingParenInText(trimmed, condOpen);
  const headerText = trimmed.slice(condOpen + 1, condClose);
  const bodyText = trimmed.slice(condClose + 1).trim();
  const bodyOffset = offset + trimmed.indexOf(bodyText);
  const { initializer, condition, step } = parseForHeader(context, headerText, functionName, offset + condOpen + 1);
  return {
    kind: "for",
    initializer,
    condition,
    step,
    body: parseStandaloneBranch(context, bodyText, functionName, bodyOffset),
  };
}

function parseStandaloneBranch(context: ParseContext, branchText: string, functionName: string, offset: number): SourceBlock {
  const parsed = parseBranch(context, branchText, functionName, offset);
  return parsed.block;
}

function parseBranch(
  context: ParseContext,
  branchText: string,
  functionName: string,
  offset: number,
): { block: SourceBlock; remainder: string } {
  const trimmed = branchText.trim();
  if (trimmed.startsWith("{")) {
    const endIndex = findMatchingBraceInText(trimmed, 0);
    const innerText = trimmed.slice(1, endIndex);
    return {
      block: parseStatementSequence(context, innerText.trim(), functionName, offset + 1),
      remainder: trimmed.slice(endIndex + 1),
    };
  }
  const first = trimmed.startsWith("if")
    ? splitTopLevelStatements(context, trimmed, offset)[0]
    : takeSingleSimpleStatement(context, trimmed, offset, functionName);
  if (!first) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset found no executable statements in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const block = parseStatementSequence(context, first.text, functionName, first.offset);
  const remainder = trimmed.slice(first.text.length).replace(/^;/, "").trim();
  return { block, remainder };
}

export function parseExpression(context: ParseContext, exprText: string, functionName: string, offset: number): SourceExpr {
  const trimmed = exprText.trim();
  const trimmedOffset = offset + exprText.indexOf(trimmed);
  return parseExpressionByPrecedence(context, trimmed, functionName, trimmedOffset, 0);
}

function parseExpressionByPrecedence(
  context: ParseContext,
  exprText: string,
  functionName: string,
  offset: number,
  level: number,
): SourceExpr {
  if (level >= BINARY_PRECEDENCE.length) {
    return parsePrimaryExpr(context, exprText, functionName, offset);
  }
  const match = findTopLevelBinaryOp(exprText, BINARY_PRECEDENCE[level].ops);
  if (match) {
    return {
      kind: "binary",
      op: match.op,
      left: parseExpressionByPrecedence(context, exprText.slice(0, match.index).trimEnd(), functionName, offset, level),
      right: parseExpressionByPrecedence(
        context,
        exprText.slice(match.index + match.op.length).trimStart(),
        functionName,
        offset + match.index + match.op.length,
        level + 1,
      ),
    };
  }
  return parseExpressionByPrecedence(context, exprText, functionName, offset, level + 1);
}

function parsePrimaryExpr(context: ParseContext, exprText: string, functionName: string, offset: number): SourceExpr {
  const trimmed = exprText.trim();
  if (trimmed.startsWith("(") && findMatchingParenInText(trimmed, 0) === trimmed.length - 1) {
    return parseExpression(context, trimmed.slice(1, -1), functionName, offset + 1);
  }
  if (trimmed.startsWith("!")) {
    const rhsText = trimmed.slice(1).trimStart();
    return {
      kind: "binary",
      left: parseExpression(context, rhsText, functionName, offset + trimmed.indexOf(rhsText)),
      op: "==",
      right: { kind: "const", value: 0 },
    };
  }
  if (trimmed.startsWith("~")) {
    const rhsText = trimmed.slice(1).trimStart();
    return {
      kind: "binary",
      left: parseExpression(context, rhsText, functionName, offset + trimmed.indexOf(rhsText)),
      op: "^",
      right: { kind: "const", value: 65535 },
    };
  }
  if (trimmed.startsWith("-")) {
    const rhsText = trimmed.slice(1).trimStart();
    return {
      kind: "binary",
      left: { kind: "const", value: 0 },
      op: "-",
      right: parseExpression(context, rhsText, functionName, offset + trimmed.indexOf(rhsText)),
    };
  }
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return { kind: "string", value: decodeStringLiteral(trimmed, context, offset, functionName) };
  }
  if (/^\d+$/.test(trimmed)) {
    return { kind: "const", value: Number.parseInt(trimmed, 10) };
  }
  if (/^[A-Za-z_]\w*$/.test(trimmed)) {
    return { kind: "ref", name: trimmed };
  }
  const callMatch = /^([A-Za-z_]\w*)\s*\((.*)\)$/.exec(trimmed);
  if (callMatch) {
    return {
      kind: "call",
      target: callMatch[1],
      args: parseCallArgs(context, callMatch[2], functionName, offset + trimmed.indexOf(callMatch[2])),
    };
  }
  throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset does not support expression '${trimmed}' in ${functionName}().`, {
    file: context.file,
    offset,
  });
}

function parseCallArgs(context: ParseContext, argsText: string, functionName: string, offset: number): SourceExpr[] {
  const trimmed = argsText.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return splitTopLevelArgs(trimmed).map((arg) => parseExpression(context, arg.text, functionName, arg.offset));
}

function parseParams(context: ParseContext, paramsText: string, functionName: string, offset: number): SourceParam[] {
  const trimmed = paramsText.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return splitTopLevelArgs(trimmed).map(({ text, offset: paramOffset }) => parseParam(context, text, functionName, paramOffset || offset));
}

function parseParam(context: ParseContext, paramText: string, functionName: string, offset: number): SourceParam {
  const match = /^(int|char)\s+([A-Za-z_]\w*)$/.exec(paramText.trim());
  if (!match) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset does not support parameter '${paramText.trim()}' in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  return {
    kind: "param",
    type: makeScalarType(match[1] as ScalarType),
    name: match[2],
  };
}

function parseDeclaration(statementText: string): { type: ScalarType; name: string; initializer?: string } | null {
  const match = /^(int|char)\s+([A-Za-z_]\w*)(?:\s*=\s*(.+))?$/.exec(statementText);
  if (!match) {
    return null;
  }
  return {
    type: match[1] as ScalarType,
    name: match[2],
    initializer: match[3],
  };
}

function splitTopLevelArgs(argsText: string): Array<{ text: string; offset: number }> {
  const parts: Array<{ text: string; offset: number }> = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let index = 0; index < argsText.length; index += 1) {
    const ch = argsText[index];
    if (ch === "\"" && argsText[index - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      continue;
    }
    if (ch === "," && depth === 0) {
      const text = argsText.slice(start, index).trim();
      if (text.length > 0) {
        parts.push({ text, offset: start + argsText.slice(start, index).indexOf(text) });
      }
      start = index + 1;
    }
  }
  const tail = argsText.slice(start).trim();
  if (tail.length > 0) {
    parts.push({ text: tail, offset: start + argsText.slice(start).indexOf(tail) });
  }
  return parts;
}

function splitTopLevelStatements(
  context: ParseContext,
  bodyText: string,
  startOffset: number,
): Array<{ text: string; offset: number }> {
  const parts: Array<{ text: string; offset: number }> = [];
  let parenDepth = 0;
  let braceDepth = 0;
  let inString = false;
  let start = 0;
  for (let index = 0; index < bodyText.length; index += 1) {
    const ch = bodyText[index];
    if (ch === "\"" && bodyText[index - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "(") {
      parenDepth += 1;
      continue;
    }
    if (ch === ")") {
      parenDepth -= 1;
      continue;
    }
    if (ch === "{") {
      braceDepth += 1;
      continue;
    }
    if (ch === "}") {
      braceDepth -= 1;
      if (braceDepth === 0) {
        let nextIndex = index + 1;
        while (nextIndex < bodyText.length && /\s/.test(bodyText[nextIndex])) {
          nextIndex += 1;
        }
        if (nextIndex < bodyText.length && !bodyText.startsWith("else", nextIndex) && bodyText[nextIndex] !== ";") {
          const text = bodyText.slice(start, index + 1).trim();
          if (text.length > 0) {
            parts.push({ text, offset: startOffset + start + bodyText.slice(start, index + 1).indexOf(text) });
          }
          start = nextIndex;
          index = nextIndex - 1;
        }
      }
      continue;
    }
    if (ch === ";" && parenDepth === 0 && braceDepth === 0) {
      let nextIndex = index + 1;
      while (nextIndex < bodyText.length && /\s/.test(bodyText[nextIndex])) {
        nextIndex += 1;
      }
      if (bodyText.startsWith("else", nextIndex)) {
        continue;
      }
      const text = bodyText.slice(start, index).trim();
      if (text.length > 0) {
        parts.push({ text, offset: startOffset + start + bodyText.slice(start, index).indexOf(text) });
      }
      start = index + 1;
    }
  }
  const tail = bodyText.slice(start).trim();
  if (tail.length > 0) {
    parts.push({ text: tail, offset: startOffset + start + bodyText.slice(start).indexOf(tail) });
  }
  if (parts.length === 0) {
    throwDiagnostic(context.normalized, "TsSccCompilerAdapter Phase C subset found no executable statements.", {
      file: context.file,
      offset: startOffset,
    });
  }
  return parts;
}

function takeSingleSimpleStatement(
  context: ParseContext,
  bodyText: string,
  startOffset: number,
  functionName: string,
): { text: string; offset: number } {
  let parenDepth = 0;
  let braceDepth = 0;
  let inString = false;
  for (let index = 0; index < bodyText.length; index += 1) {
    const ch = bodyText[index];
    if (ch === "\"" && bodyText[index - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "(") {
      parenDepth += 1;
      continue;
    }
    if (ch === ")") {
      parenDepth -= 1;
      continue;
    }
    if (ch === "{") {
      braceDepth += 1;
      continue;
    }
    if (ch === "}") {
      braceDepth -= 1;
      continue;
    }
    if (ch === ";" && parenDepth === 0 && braceDepth === 0) {
      const text = bodyText.slice(0, index).trim();
      return {
        text,
        offset: startOffset + bodyText.slice(0, index).indexOf(text),
      };
    }
  }
  const text = bodyText.trim();
  if (text.length > 0) {
    return {
      text,
      offset: startOffset + bodyText.indexOf(text),
    };
  }
  throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset could not parse branch statement in ${functionName}().`, {
    file: context.file,
    offset: startOffset,
  });
}

function findTopLevelBinaryOp(exprText: string, ops: readonly BinaryOp[]): { index: number; op: BinaryOp } | null {
  let depth = 0;
  let inString = false;
  const orderedOps = [...ops].sort((left, right) => right.length - left.length);
  const allBinaryOps = [...new Set(BINARY_PRECEDENCE.flatMap((entry) => entry.ops))].sort((left, right) => right.length - left.length);
  for (let index = exprText.length - 1; index >= 0; index -= 1) {
    const ch = exprText[index];
    if (ch === "\"" && exprText[index - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === ")") {
      depth += 1;
      continue;
    }
    if (ch === "(") {
      depth -= 1;
      continue;
    }
    if (depth !== 0) {
      continue;
    }
    const matchedOp = allBinaryOps.find((op) => exprText.slice(index - op.length + 1, index + 1) === op);
    if (!matchedOp || !orderedOps.includes(matchedOp)) {
      continue;
    }
    const opIndex = index - matchedOp.length + 1;
    const longestStartingOp = allBinaryOps.find((op) => exprText.slice(opIndex, opIndex + op.length) === op);
    if (longestStartingOp !== matchedOp) {
      continue;
    }
    const leftText = exprText.slice(0, opIndex).trim();
    const rightText = exprText.slice(opIndex + matchedOp.length).trim();
    if (leftText.length === 0 || rightText.length === 0) {
      continue;
    }
    return { index: opIndex, op: matchedOp };
  }
  return null;
}

function findMatchingBraceIndex(context: ParseContext, openBraceIndex: number): number {
  return findMatchingDelimitedIndex(context, openBraceIndex, "{", "}", "TsSccCompilerAdapter Phase C subset found an unmatched '{' in source input.");
}

function findMatchingBraceInText(text: string, openBraceIndex: number): number {
  let depth = 0;
  for (let index = openBraceIndex; index < text.length; index += 1) {
    if (text[index] === "{") {
      depth += 1;
      continue;
    }
    if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error("Unmatched brace in parser helper.");
}

function findMatchingParenInText(text: string, openParenIndex: number): number {
  let depth = 0;
  for (let index = openParenIndex; index < text.length; index += 1) {
    if (text[index] === "(") {
      depth += 1;
      continue;
    }
    if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error("Unmatched paren in parser helper.");
}

function findMatchingDelimitedIndex(
  context: ParseContext,
  openIndex: number,
  openChar: string,
  closeChar: string,
  message: string,
): number {
  let depth = 0;
  for (let index = openIndex; index < context.normalized.length; index += 1) {
    const ch = context.normalized[index];
    if (ch === openChar) {
      depth += 1;
      continue;
    }
    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throwDiagnostic(context.normalized, message, { file: context.file, offset: openIndex });
}

function makeScalarType(name: ScalarType): SourceType {
  return { kind: "scalar", name };
}

function parseExpressionStatement(
  context: ParseContext,
  statementText: string,
  functionName: string,
  offset: number,
): SourceStmt | null {
  const simple = parseSimpleStatement(context, statementText, functionName, offset);
  if (!simple) {
    return null;
  }
  return simple.kind === "expr" ? { kind: "expr", expr: simple.expr } : { kind: "assign", name: simple.name, expr: simple.expr };
}

function parseSimpleStatement(
  context: ParseContext,
  statementText: string,
  functionName: string,
  offset: number,
): SourceSimpleStmt | null {
  const trimmed = statementText.trim();
  const assignMatch = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(trimmed);
  if (assignMatch) {
    return {
      kind: "assign",
      name: assignMatch[1],
      expr: parseExpression(context, assignMatch[2], functionName, offset + statementText.indexOf(assignMatch[2])),
    };
  }
  if (!/^([A-Za-z_]\w*)\s*\(.*\)$/.test(trimmed)) {
    return null;
  }
  return {
    kind: "expr",
    expr: parseExpression(context, trimmed, functionName, offset + statementText.indexOf(trimmed)),
  };
}

function decodeStringLiteral(
  literalText: string,
  context: ParseContext,
  offset: number,
  functionName: string,
): string {
  let result = "";
  for (let index = 1; index < literalText.length - 1; index += 1) {
    const ch = literalText[index];
    if (ch !== "\\") {
      result += ch;
      continue;
    }
    index += 1;
    const escaped = literalText[index];
    switch (escaped) {
      case "\\":
        result += "\\";
        break;
      case "\"":
        result += "\"";
        break;
      case "n":
        result += "\n";
        break;
      case "r":
        result += "\r";
        break;
      case "t":
        result += "\t";
        break;
      case "0":
        result += "\0";
        break;
      default:
        throwDiagnostic(
          context.normalized,
          `TsSccCompilerAdapter Phase C subset does not support string escape '\\${escaped}' in ${functionName}().`,
          { file: context.file, offset: offset + index - 1 },
        );
    }
  }
  return result;
}

function parseForHeader(
  context: ParseContext,
  headerText: string,
  functionName: string,
  offset: number,
): { initializer?: SourceForInit; condition?: SourceExpr; step?: SourceSimpleStmt } {
  const parts = splitForHeaderParts(context, headerText, offset, functionName);
  if (parts.length !== 3) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset could not parse for header '${headerText.trim()}' in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const initializer = parts[0].text.length > 0 ? parseForInitializer(context, parts[0].text, functionName, parts[0].offset) : undefined;
  const condition = parts[1].text.length > 0 ? parseExpression(context, parts[1].text, functionName, parts[1].offset) : undefined;
  const step = parts[2].text.length > 0 ? parseSimpleStatement(context, parts[2].text, functionName, parts[2].offset) : undefined;
  if (parts[0].text.length > 0 && !initializer) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset only supports simple assignment/call/local declaration for-loop initializers in ${functionName}().`, {
      file: context.file,
      offset: parts[0].offset,
    });
  }
  if (parts[2].text.length > 0 && !step) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset only supports simple assignment/call for-loop steps in ${functionName}().`, {
      file: context.file,
      offset: parts[2].offset,
    });
  }
  return {
    initializer: initializer ?? undefined,
    condition,
    step: step ?? undefined,
  };
}

function parseForInitializer(
  context: ParseContext,
  initText: string,
  functionName: string,
  offset: number,
): SourceForInit | null {
  const declaration = parseDeclaration(initText);
  if (declaration) {
    return {
      kind: "localDecl",
      name: declaration.name,
      type: makeScalarType(declaration.type),
      initializer: declaration.initializer
        ? parseExpression(context, declaration.initializer, functionName, offset + initText.indexOf(declaration.initializer))
        : undefined,
    };
  }
  return parseSimpleStatement(context, initText, functionName, offset);
}

function splitForHeaderParts(
  context: ParseContext,
  headerText: string,
  offset: number,
  functionName: string,
): Array<{ text: string; offset: number }> {
  const parts: Array<{ text: string; offset: number }> = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let index = 0; index < headerText.length; index += 1) {
    const ch = headerText[index];
    if (ch === "\"" && headerText[index - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      continue;
    }
    if (ch === ";" && depth === 0) {
      const raw = headerText.slice(start, index);
      const text = raw.trim();
      parts.push({ text, offset: offset + start + raw.indexOf(text) });
      start = index + 1;
    }
  }
  const tailRaw = headerText.slice(start);
  const tailText = tailRaw.trim();
  parts.push({ text: tailText, offset: offset + start + tailRaw.indexOf(tailText) });
  if (parts.length !== 3) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset expected 3 clauses in for header '${headerText.trim()}' in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  return parts;
}

export type { ParseContext };
export type { AdditiveOp, BitwiseOp, CompareOp, LogicalOp, MultiplicativeOp, ShiftOp };

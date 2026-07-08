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
  SourceSwitchCase,
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
  if (/^do\b/.test(statementText)) {
    return { kind: "stmt", statement: parseDoWhileStmt(context, statementText, functionName, offset) };
  }
  if (/^for\b/.test(statementText)) {
    return { kind: "stmt", statement: parseForStmt(context, statementText, functionName, offset) };
  }
  if (/^switch\b/.test(statementText)) {
    return { kind: "stmt", statement: parseSwitchStmt(context, statementText, functionName, offset) };
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
      type: declaration.type === "charArray" ? makeCharArrayType(declaration.length) : makeScalarType(declaration.type),
      initializer: declaration.type !== "charArray" && declaration.initializer
        ? parseExpression(context, declaration.initializer, functionName, offset + statementText.indexOf(declaration.initializer))
        : undefined,
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

function parseDoWhileStmt(context: ParseContext, statementText: string, functionName: string, offset: number): SourceStmt {
  const trimmed = statementText.trim();
  if (!trimmed.startsWith("do")) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset could not parse do-while statement in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const whileIndex = findDoWhileKeywordIndex(trimmed);
  if (whileIndex < 0) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset could not parse do-while statement in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const bodyText = trimmed.slice(2, whileIndex).trim();
  const whileText = trimmed.slice(whileIndex).trim();
  const condOpen = whileText.indexOf("(");
  if (!whileText.startsWith("while") || condOpen < 0) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset could not parse do-while condition in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const condClose = findMatchingParenInText(whileText, condOpen);
  const conditionText = whileText.slice(condOpen + 1, condClose);
  const bodyOffset = offset + trimmed.indexOf(bodyText);
  return {
    kind: "doWhile",
    body: parseStandaloneBranch(context, bodyText, functionName, bodyOffset),
    condition: parseExpression(context, conditionText, functionName, offset + trimmed.indexOf(conditionText)),
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

function parseSwitchStmt(context: ParseContext, statementText: string, functionName: string, offset: number): SourceStmt {
  const trimmed = statementText.trim();
  const condOpen = trimmed.indexOf("(");
  if (!trimmed.startsWith("switch") || condOpen < 0) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset could not parse switch statement in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const condClose = findMatchingParenInText(trimmed, condOpen);
  const switchExprText = trimmed.slice(condOpen + 1, condClose);
  const bodyText = trimmed.slice(condClose + 1).trim();
  if (!bodyText.startsWith("{")) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset only supports brace-wrapped switch bodies in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const bodyClose = findMatchingBraceInText(bodyText, 0);
  const switchBodyText = bodyText.slice(1, bodyClose);
  const { cases, defaultCase } = parseSwitchCases(context, switchBodyText, functionName, offset + trimmed.indexOf(switchBodyText));
  return {
    kind: "switch",
    expr: parseExpression(context, switchExprText, functionName, offset + condOpen + 1),
    cases,
    defaultCase,
  };
}

function parseStandaloneBranch(context: ParseContext, branchText: string, functionName: string, offset: number): SourceBlock {
  const parsed = parseBranch(context, branchText, functionName, offset);
  return parsed.block;
}

function parseSwitchCases(
  context: ParseContext,
  bodyText: string,
  functionName: string,
  offset: number,
): { cases: SourceSwitchCase[]; defaultCase?: SourceBlock } {
  const labels = findSwitchLabels(context, bodyText, functionName, offset);
  if (labels.length === 0) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset found no case/default labels in switch statement for ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const cases: SourceSwitchCase[] = [];
  let defaultCase: SourceBlock | undefined;
  for (let index = 0; index < labels.length; index += 1) {
    const current = labels[index];
    const next = labels[index + 1];
    const segmentText = bodyText.slice(current.bodyStart, next?.index ?? bodyText.length);
    const block = parseCaseBody(context, segmentText, functionName, offset + current.bodyStart);
    if (current.kind === "case") {
      cases.push({ kind: "switchCase", value: current.value, body: block });
    } else {
      defaultCase = block;
    }
  }
  return { cases, defaultCase };
}

function parseCaseBody(context: ParseContext, bodyText: string, functionName: string, offset: number): SourceBlock {
  const trimmed = bodyText.trim();
  if (trimmed.length === 0) {
    return { kind: "block", declarations: [], statements: [] };
  }
  return parseStatementSequence(context, trimmed, functionName, offset + bodyText.indexOf(trimmed));
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
  const comma = findTopLevelComma(trimmed);
  if (comma) {
    return {
      kind: "comma",
      left: parseExpression(context, comma.leftText, functionName, trimmedOffset),
      right: parseExpression(context, comma.rightText, functionName, trimmedOffset + comma.index + 1),
    };
  }
  const compoundAssignment = findTopLevelCompoundAssignment(trimmed);
  if (compoundAssignment) {
    const lhs = compoundAssignment.leftText.trim();
    const rhsOffset = trimmedOffset + compoundAssignment.index + compoundAssignment.op.length;
    const rhs = parseExpression(context, compoundAssignment.rightText, functionName, rhsOffset);
    const arrayAccess = parseArrayAccess(lhs);
    if (arrayAccess) {
      const indexExpr = parseExpression(context, arrayAccess.indexText, functionName, trimmedOffset + lhs.indexOf(arrayAccess.indexText));
      return {
        kind: "arrayAssign",
        name: arrayAccess.name,
        index: indexExpr,
        expr: {
          kind: "binary",
          left: { kind: "arrayIndex", name: arrayAccess.name, index: indexExpr },
          op: compoundAssignOpToBinaryOp(compoundAssignment.op),
          right: rhs,
        },
      };
    }
    if (/^[A-Za-z_]\w*$/.test(lhs)) {
      return {
        kind: "assign",
        name: lhs,
        expr: {
          kind: "binary",
          left: { kind: "ref", name: lhs },
          op: compoundAssignOpToBinaryOp(compoundAssignment.op),
          right: rhs,
        },
      };
    }
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset only supports compound assignment to local symbols or char array elements, got '${lhs}' in ${functionName}().`, {
      file: context.file,
      offset: trimmedOffset,
    });
  }
  const assignment = findTopLevelAssignment(trimmed);
  if (assignment) {
    const lhs = assignment.leftText.trim();
    const rhsOffset = trimmedOffset + assignment.index + 1;
    const arrayAccess = parseArrayAccess(lhs);
    if (arrayAccess) {
      return {
        kind: "arrayAssign",
        name: arrayAccess.name,
        index: parseExpression(context, arrayAccess.indexText, functionName, trimmedOffset + lhs.indexOf(arrayAccess.indexText)),
        expr: parseExpression(context, assignment.rightText, functionName, rhsOffset),
      };
    }
    if (/^[A-Za-z_]\w*$/.test(lhs)) {
      return {
        kind: "assign",
        name: lhs,
        expr: parseExpression(context, assignment.rightText, functionName, rhsOffset),
      };
    }
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset only supports assignment to local symbols or char array elements, got '${lhs}' in ${functionName}().`, {
      file: context.file,
      offset: trimmedOffset,
    });
  }
  const conditional = findTopLevelConditional(trimmed);
  if (conditional) {
    return {
      kind: "conditional",
      condition: parseExpression(context, conditional.conditionText, functionName, trimmedOffset),
      thenExpr: parseExpression(
        context,
        conditional.thenText,
        functionName,
        trimmedOffset + conditional.questionIndex + 1,
      ),
      elseExpr: parseExpression(
        context,
        conditional.elseText,
        functionName,
        trimmedOffset + conditional.colonIndex + 1,
      ),
    };
  }
  return parseExpressionByPrecedence(context, trimmed, functionName, trimmedOffset, 0);
}

function findTopLevelComma(exprText: string): { index: number; leftText: string; rightText: string } | null {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inString = false;
  for (let index = 0; index < exprText.length; index += 1) {
    const ch = exprText[index];
    if (ch === "\"" && exprText[index - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    switch (ch) {
      case "(":
        parenDepth += 1;
        continue;
      case ")":
        parenDepth -= 1;
        continue;
      case "[":
        bracketDepth += 1;
        continue;
      case "]":
        bracketDepth -= 1;
        continue;
      case "{":
        braceDepth += 1;
        continue;
      case "}":
        braceDepth -= 1;
        continue;
      default:
        break;
    }
    if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0 || ch !== ",") {
      continue;
    }
    const leftText = exprText.slice(0, index).trimEnd();
    const rightText = exprText.slice(index + 1).trimStart();
    if (leftText.length === 0 || rightText.length === 0) {
      continue;
    }
    return { index, leftText, rightText };
  }
  return null;
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
  const prefixArrayIncDecMatch = /^(\+\+|--)\s*([A-Za-z_]\w*)\s*\[(.+)\]$/.exec(trimmed);
  if (prefixArrayIncDecMatch) {
    return {
      kind: "preArrayIncDec",
      name: prefixArrayIncDecMatch[2],
      index: parseExpression(context, prefixArrayIncDecMatch[3], functionName, offset + trimmed.indexOf(prefixArrayIncDecMatch[3])),
      op: prefixArrayIncDecMatch[1] as "++" | "--",
    };
  }
  const prefixIncDecMatch = /^(\+\+|--)\s*([A-Za-z_]\w*)$/.exec(trimmed);
  if (prefixIncDecMatch) {
    return {
      kind: "preIncDec",
      name: prefixIncDecMatch[2],
      op: prefixIncDecMatch[1] as "++" | "--",
    };
  }
  const postfixArrayIncDecMatch = /^([A-Za-z_]\w*)\s*\[(.+)\]\s*(\+\+|--)$/.exec(trimmed);
  if (postfixArrayIncDecMatch) {
    return {
      kind: "postArrayIncDec",
      name: postfixArrayIncDecMatch[1],
      index: parseExpression(context, postfixArrayIncDecMatch[2], functionName, offset + trimmed.indexOf(postfixArrayIncDecMatch[2])),
      op: postfixArrayIncDecMatch[3] as "++" | "--",
    };
  }
  const postfixIncDecMatch = /^([A-Za-z_]\w*)\s*(\+\+|--)$/.exec(trimmed);
  if (postfixIncDecMatch) {
    return {
      kind: "postIncDec",
      name: postfixIncDecMatch[1],
      op: postfixIncDecMatch[2] as "++" | "--",
    };
  }
  if (trimmed.startsWith("sizeof")) {
    return parseSizeofExpr(context, trimmed, functionName, offset);
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
  const arrayAccess = parseArrayAccess(trimmed);
  if (arrayAccess) {
    return {
      kind: "arrayIndex",
      name: arrayAccess.name,
      index: parseExpression(context, arrayAccess.indexText, functionName, offset + trimmed.indexOf(arrayAccess.indexText)),
    };
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

function parseSizeofExpr(context: ParseContext, exprText: string, functionName: string, offset: number): SourceExpr {
  const match = /^sizeof\b/.exec(exprText);
  if (!match) {
    throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset could not parse sizeof expression '${exprText}' in ${functionName}().`, {
      file: context.file,
      offset,
    });
  }
  const operandText = exprText.slice(match[0].length).trimStart();
  const operandOffset = offset + exprText.indexOf(operandText);
  const typeMatch = /^\(\s*(int|char)\s*\)$/.exec(operandText);
  if (typeMatch) {
    return {
      kind: "sizeofType",
      type: makeScalarType(typeMatch[1] as ScalarType),
    };
  }
  if (/^(int|char)$/.test(operandText)) {
    return {
      kind: "sizeofType",
      type: makeScalarType(operandText as ScalarType),
    };
  }
  if (operandText.startsWith("(") && findMatchingParenInText(operandText, 0) === operandText.length - 1) {
    return {
      kind: "sizeofExpr",
      expr: parseExpression(context, operandText.slice(1, -1), functionName, operandOffset + 1),
    };
  }
  return {
    kind: "sizeofExpr",
    expr: parsePrimaryExpr(context, operandText, functionName, operandOffset),
  };
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
  const trimmed = paramText.trim();
  const charArrayMatch = /^char\s+([A-Za-z_]\w*)\s*\[\s*\]$/.exec(trimmed);
  if (charArrayMatch) {
    return {
      kind: "param",
      type: { kind: "array", elementType: "char" },
      name: charArrayMatch[1],
    };
  }
  const match = /^(int|char)\s+([A-Za-z_]\w*)$/.exec(trimmed);
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

function parseDeclaration(statementText: string): { type: ScalarType; name: string; initializer?: string } | { type: "charArray"; name: string; length: number } | null {
  const arrayMatch = /^char\s+([A-Za-z_]\w*)\s*\[\s*(\d+)\s*\]$/.exec(statementText);
  if (arrayMatch) {
    return {
      type: "charArray",
      name: arrayMatch[1],
      length: Number.parseInt(arrayMatch[2], 10),
    };
  }
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

function findTopLevelConditional(exprText: string):
  | { conditionText: string; thenText: string; elseText: string; questionIndex: number; colonIndex: number }
  | null {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inString = false;
  let questionIndex = -1;
  let conditionalDepth = 0;
  for (let index = 0; index < exprText.length; index += 1) {
    const ch = exprText[index];
    if (ch === "\"" && exprText[index - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    switch (ch) {
      case "(":
        parenDepth += 1;
        continue;
      case ")":
        parenDepth -= 1;
        continue;
      case "[":
        bracketDepth += 1;
        continue;
      case "]":
        bracketDepth -= 1;
        continue;
      case "{":
        braceDepth += 1;
        continue;
      case "}":
        braceDepth -= 1;
        continue;
      default:
        break;
    }
    if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0) {
      continue;
    }
    if (ch === "?") {
      if (questionIndex < 0) {
        questionIndex = index;
      }
      conditionalDepth += 1;
      continue;
    }
    if (ch === ":" && conditionalDepth > 0) {
      conditionalDepth -= 1;
      if (conditionalDepth === 0 && questionIndex >= 0) {
        return {
          conditionText: exprText.slice(0, questionIndex).trimEnd(),
          thenText: exprText.slice(questionIndex + 1, index).trim(),
          elseText: exprText.slice(index + 1).trimStart(),
          questionIndex,
          colonIndex: index,
        };
      }
    }
  }
  return null;
}

function findTopLevelAssignment(exprText: string): { index: number; leftText: string; rightText: string } | null {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inString = false;
  for (let index = 0; index < exprText.length; index += 1) {
    const ch = exprText[index];
    if (ch === "\"" && exprText[index - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    switch (ch) {
      case "(":
        parenDepth += 1;
        continue;
      case ")":
        parenDepth -= 1;
        continue;
      case "[":
        bracketDepth += 1;
        continue;
      case "]":
        bracketDepth -= 1;
        continue;
      case "{":
        braceDepth += 1;
        continue;
      case "}":
        braceDepth -= 1;
        continue;
      default:
        break;
    }
    if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0 || ch !== "=") {
      continue;
    }
    const prev = exprText[index - 1] ?? "";
    const next = exprText[index + 1] ?? "";
    if (prev === "=" || prev === "!" || prev === "<" || prev === ">" || next === "=") {
      continue;
    }
    const leftText = exprText.slice(0, index).trimEnd();
    const rightText = exprText.slice(index + 1).trimStart();
    if (leftText.length === 0 || rightText.length === 0) {
      continue;
    }
    return { index, leftText, rightText };
  }
  return null;
}

function findTopLevelCompoundAssignment(exprText: string):
  | { index: number; op: "<<=" | ">>=" | "+=" | "-=" | "*=" | "/=" | "%=" | "&=" | "^=" | "|="; leftText: string; rightText: string }
  | null {
  const ops = ["<<=", ">>=", "+=", "-=", "*=", "/=", "%=", "&=", "^=", "|="] as const;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inString = false;
  for (let index = 0; index < exprText.length; index += 1) {
    const ch = exprText[index];
    if (ch === "\"" && exprText[index - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    switch (ch) {
      case "(":
        parenDepth += 1;
        continue;
      case ")":
        parenDepth -= 1;
        continue;
      case "[":
        bracketDepth += 1;
        continue;
      case "]":
        bracketDepth -= 1;
        continue;
      case "{":
        braceDepth += 1;
        continue;
      case "}":
        braceDepth -= 1;
        continue;
      default:
        break;
    }
    if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0) {
      continue;
    }
    const op = ops.find((candidate) => exprText.slice(index, index + candidate.length) === candidate);
    if (!op) {
      continue;
    }
    const leftText = exprText.slice(0, index).trimEnd();
    const rightText = exprText.slice(index + op.length).trimStart();
    if (leftText.length === 0 || rightText.length === 0) {
      continue;
    }
    return { index, op, leftText, rightText };
  }
  return null;
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
        const currentText = bodyText.slice(start, index + 1).trimStart();
        if (/^do\b/.test(currentText) && bodyText.startsWith("while", nextIndex)) {
          continue;
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
      const currentText = bodyText.slice(start, index).trimStart();
      if (/^do\b/.test(currentText) && bodyText.startsWith("while", nextIndex)) {
        continue;
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

function findSwitchLabels(
  context: ParseContext,
  bodyText: string,
  functionName: string,
  offset: number,
): Array<
  | { kind: "case"; index: number; bodyStart: number; value: number }
  | { kind: "default"; index: number; bodyStart: number }
> {
  const labels: Array<
    | { kind: "case"; index: number; bodyStart: number; value: number }
    | { kind: "default"; index: number; bodyStart: number }
  > = [];
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
    if (parenDepth !== 0 || braceDepth !== 0) {
      continue;
    }
    if (isWordStart(bodyText, index) && bodyText.startsWith("case", index) && /\s/.test(bodyText[index + 4] ?? "")) {
      const colonIndex = findTopLevelSwitchColon(context, bodyText, index + 4, functionName, offset);
      const valueText = bodyText.slice(index + 4, colonIndex).trim();
      if (!/^-?\d+$/.test(valueText)) {
        throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset only supports integer literal case labels, got '${valueText}' in ${functionName}().`, {
          file: context.file,
          offset: offset + index,
        });
      }
      labels.push({
        kind: "case",
        index,
        bodyStart: colonIndex + 1,
        value: Number.parseInt(valueText, 10),
      });
      index = colonIndex;
      continue;
    }
    if (isWordStart(bodyText, index) && bodyText.startsWith("default", index)) {
      const colonIndex = findTopLevelSwitchColon(context, bodyText, index + 7, functionName, offset);
      labels.push({
        kind: "default",
        index,
        bodyStart: colonIndex + 1,
      });
      index = colonIndex;
    }
  }
  return labels;
}

function findTopLevelSwitchColon(
  context: ParseContext,
  text: string,
  startIndex: number,
  functionName: string,
  offset: number,
): number {
  let parenDepth = 0;
  let braceDepth = 0;
  let inString = false;
  for (let index = startIndex; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === "\"" && text[index - 1] !== "\\") {
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
    if (parenDepth === 0 && braceDepth === 0 && ch === ":") {
      return index;
    }
  }
  throwDiagnostic(context.normalized, `TsSccCompilerAdapter Phase C subset could not parse switch label in ${functionName}().`, {
    file: context.file,
    offset,
  });
}

function isWordStart(text: string, index: number): boolean {
  if (index > 0 && /[A-Za-z0-9_]/.test(text[index - 1])) {
    return false;
  }
  return true;
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

function findDoWhileKeywordIndex(text: string): number {
  let parenDepth = 0;
  let braceDepth = 0;
  let inString = false;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const ch = text[index];
    if (ch === "\"" && text[index - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "(") {
      parenDepth -= 1;
      continue;
    }
    if (ch === ")") {
      parenDepth += 1;
      continue;
    }
    if (ch === "{") {
      braceDepth -= 1;
      continue;
    }
    if (ch === "}") {
      braceDepth += 1;
      continue;
    }
    if (parenDepth === 0 && braceDepth === 0 && text.startsWith("while", index) && isWordStart(text, index)) {
      return index;
    }
  }
  return -1;
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
    if ((matchedOp === "+" || matchedOp === "-")
      && (exprText[opIndex - 1] === matchedOp || exprText[opIndex + matchedOp.length] === matchedOp)) {
      continue;
    }
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

function makeCharArrayType(length: number): SourceType {
  return { kind: "array", elementType: "char", length };
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
  switch (simple.kind) {
    case "expr":
      return { kind: "expr", expr: simple.expr };
    case "assign":
      return { kind: "assign", name: simple.name, expr: simple.expr };
    case "arrayAssign":
      return { kind: "arrayAssign", name: simple.name, index: simple.index, expr: simple.expr };
    default:
      return assertNever(simple);
  }
}

function parseSimpleStatement(
  context: ParseContext,
  statementText: string,
  functionName: string,
  offset: number,
): SourceSimpleStmt | null {
  const trimmed = statementText.trim();
  const prefixArrayIncDecMatch = /^(\+\+|--)\s*([A-Za-z_]\w*)\s*\[(.+)\]$/.exec(trimmed);
  if (prefixArrayIncDecMatch) {
    const index = parseExpression(context, prefixArrayIncDecMatch[3], functionName, offset + statementText.indexOf(prefixArrayIncDecMatch[3]));
    return {
      kind: "arrayAssign",
      name: prefixArrayIncDecMatch[2],
      index,
      expr: {
        kind: "binary",
        left: { kind: "arrayIndex", name: prefixArrayIncDecMatch[2], index },
        op: prefixArrayIncDecMatch[1] === "++" ? "+" : "-",
        right: { kind: "const", value: 1 },
      },
    };
  }
  const prefixIncDecMatch = /^(\+\+|--)\s*([A-Za-z_]\w*)$/.exec(trimmed);
  if (prefixIncDecMatch) {
    return {
      kind: "assign",
      name: prefixIncDecMatch[2],
      expr: {
        kind: "binary",
        left: { kind: "ref", name: prefixIncDecMatch[2] },
        op: prefixIncDecMatch[1] === "++" ? "+" : "-",
        right: { kind: "const", value: 1 },
      },
    };
  }
  const arrayCompoundAssignMatch = /^([A-Za-z_]\w*)\s*\[(.+)\]\s*(<<=|>>=|\+=|-=|\*=|\/=|%=|&=|\^=|\|=)\s*(.+)$/.exec(trimmed);
  if (arrayCompoundAssignMatch) {
    const index = parseExpression(context, arrayCompoundAssignMatch[2], functionName, offset + statementText.indexOf(arrayCompoundAssignMatch[2]));
    const rhs = parseExpression(context, arrayCompoundAssignMatch[4], functionName, offset + statementText.indexOf(arrayCompoundAssignMatch[4]));
    return {
      kind: "arrayAssign",
      name: arrayCompoundAssignMatch[1],
      index,
      expr: {
        kind: "binary",
        left: { kind: "arrayIndex", name: arrayCompoundAssignMatch[1], index },
        op: compoundAssignOpToBinaryOp(arrayCompoundAssignMatch[3]),
        right: rhs,
      },
    };
  }
  const compoundAssignMatch = /^([A-Za-z_]\w*)\s*(<<=|>>=|\+=|-=|\*=|\/=|%=|&=|\^=|\|=)\s*(.+)$/.exec(trimmed);
  if (compoundAssignMatch) {
    const rhs = parseExpression(context, compoundAssignMatch[3], functionName, offset + statementText.indexOf(compoundAssignMatch[3]));
    return {
      kind: "assign",
      name: compoundAssignMatch[1],
      expr: {
        kind: "binary",
        left: { kind: "ref", name: compoundAssignMatch[1] },
        op: compoundAssignOpToBinaryOp(compoundAssignMatch[2]),
        right: rhs,
      },
    };
  }
  const arrayIncDecMatch = /^([A-Za-z_]\w*)\s*\[(.+)\]\s*(\+\+|--)$/.exec(trimmed);
  if (arrayIncDecMatch) {
    const index = parseExpression(context, arrayIncDecMatch[2], functionName, offset + statementText.indexOf(arrayIncDecMatch[2]));
    return {
      kind: "arrayAssign",
      name: arrayIncDecMatch[1],
      index,
      expr: {
        kind: "binary",
        left: { kind: "arrayIndex", name: arrayIncDecMatch[1], index },
        op: arrayIncDecMatch[3] === "++" ? "+" : "-",
        right: { kind: "const", value: 1 },
      },
    };
  }
  const incDecMatch = /^([A-Za-z_]\w*)\s*(\+\+|--)$/.exec(trimmed);
  if (incDecMatch) {
    return {
      kind: "assign",
      name: incDecMatch[1],
      expr: {
        kind: "binary",
        left: { kind: "ref", name: incDecMatch[1] },
        op: incDecMatch[2] === "++" ? "+" : "-",
        right: { kind: "const", value: 1 },
      },
    };
  }
  const arrayAssignMatch = /^([A-Za-z_]\w*)\s*\[(.+)\]\s*=\s*(.+)$/.exec(trimmed);
  if (arrayAssignMatch) {
    return {
      kind: "arrayAssign",
      name: arrayAssignMatch[1],
      index: parseExpression(context, arrayAssignMatch[2], functionName, offset + statementText.indexOf(arrayAssignMatch[2])),
      expr: parseExpression(context, arrayAssignMatch[3], functionName, offset + statementText.indexOf(arrayAssignMatch[3])),
    };
  }
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
      type: declaration.type === "charArray" ? makeCharArrayType(declaration.length) : makeScalarType(declaration.type),
      initializer: declaration.type !== "charArray" && declaration.initializer
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

function parseArrayAccess(text: string): { name: string; indexText: string } | null {
  const match = /^([A-Za-z_]\w*)\s*\[(.+)\]$/.exec(text);
  if (!match) {
    return null;
  }
  return {
    name: match[1],
    indexText: match[2].trim(),
  };
}

function compoundAssignOpToBinaryOp(op: string): BinaryOp {
  switch (op) {
    case "+=":
      return "+";
    case "-=":
      return "-";
    case "*=":
      return "*";
    case "/=":
      return "/";
    case "%=":
      return "%";
    case "&=":
      return "&";
    case "^=":
      return "^";
    case "|=":
      return "|";
    case "<<=":
      return "<<";
    case ">>=":
      return ">>";
    default:
      throw new Error(`Unexpected compound assignment operator: ${op}`);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected parser value: ${JSON.stringify(value)}`);
}

export type { ParseContext };
export type { AdditiveOp, BitwiseOp, CompareOp, LogicalOp, MultiplicativeOp, ShiftOp };

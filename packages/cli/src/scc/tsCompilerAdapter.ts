import fs from "node:fs";
import path from "node:path";
import { assemble } from "../cli/mz80-as";
import { Logger } from "../logger";
import { CompilerAdapter, CompilerAdapterCompileOptions, CompileSccSourceResult } from "./compilerAdapter";
import { getSccFixture, readSccFixture } from "./fixtures";
import { lowerSourceProgram as lowerBoundProgram } from "./tsFrontendLowering";
import { parseProgram } from "./tsFrontendParser";
import { analyzeProgram } from "./tsFrontendSemantic";
import { emitProgram as emitLoweredProgram } from "./tsProgram";
import { translateSccAsm } from "./translateAsm";

export type TsSccCompilerAdapterOptions = {
  fixtureId?: string;
};

type ScalarType = "char" | "int";

type SourceProgram = {
  functions: SourceFunction[];
};

type SourceFunction = {
  name: string;
  returnType: ScalarType;
  params: SourceParam[];
  locals: SourceLocal[];
  body: SourceStmt[];
};

type SourceParam = {
  name: string;
  type: ScalarType;
};

type SourceLocal = {
  name: string;
  type: ScalarType;
};

type SourceStmt = {
  kind: "return";
  expr: SourceExpr;
} | {
  kind: "if";
  condition: SourceExpr;
  thenBody: SourceStmt[];
  elseBody: SourceStmt[];
} | {
  kind: "while";
  condition: SourceExpr;
  body: SourceStmt[];
} | {
  kind: "assign";
  name: string;
  expr: SourceExpr;
};

type SourceExpr =
  | { kind: "const"; value: number }
  | { kind: "ref"; name: string }
  | { kind: "compare"; left: SourceExpr; right: SourceExpr; op: "==" | "!=" | ">" | "<" | ">=" | "<=" }
  | { kind: "call"; target: string; args: SourceExpr[] };

type ProgramSpec = {
  moduleName: string;
  exports?: string[];
  externs?: string[];
  data?: DataSpec[];
  functions: FunctionSpec[];
  includeBss?: boolean;
};

type ExprSpec =
  | { kind: "const"; value: number }
  | { kind: "dataAddress"; label: string }
  | { kind: "call"; target: string; args?: ExprSpec[] }
  | { kind: "compare"; left: ExprSpec; right: ExprSpec; helper: string }
  | { kind: "localChar"; offset: number }
  | { kind: "localInt"; offset: number }
  | { kind: "argChar"; offset: number }
  | { kind: "argInt"; offset: number };

type FunctionSpec = {
  name: string;
  statements: StatementSpec[];
};

type DataSpec = {
  label: string;
  directive: ".ascii" | ".asciz" | ".db" | ".dw" | ".ds";
  value: string;
};

type ValueWidth = 1 | 2;

type RefIR = {
  kind: "ref";
  scope: "local" | "arg";
  width: ValueWidth;
  slot: number;
};

type ExprIR =
  | { kind: "const"; value: number }
  | { kind: "dataAddress"; label: string }
  | RefIR
  | { kind: "compare"; left: ExprIR; right: ExprIR; helper: string }
  | { kind: "call"; target: string; args?: ExprIR[] };

type FunctionIR = {
  name: string;
  params: ValueWidth[];
  locals: ValueWidth[];
  body: StmtIRHigh[];
};

type StmtIRHigh =
  | { kind: "assignLocalConst"; slot: number; width: ValueWidth; value: number }
  | { kind: "assignLocalExpr"; slot: number; width: ValueWidth; expr: ExprIR }
  | { kind: "compareReturn"; left: ExprIR; right: ExprIR; helper: string }
  | { kind: "returnExpr"; expr: ExprIR }
  | { kind: "returnVoid" }
  | { kind: "emitExprChar"; expr: ExprIR }
  | { kind: "callModeAArg"; target: string; mode: number; expr: ExprIR }
  | { kind: "decLocalByte"; slot: number }
  | { kind: "emitChar"; value: number }
  | { kind: "doWhileExprNonZero"; body: StmtIRHigh[]; expr: ExprIR }
  | { kind: "ifExprZero"; expr: ExprIR; thenBody: StmtIRHigh[]; elseBody: StmtIRHigh[] };

type FunctionLayout = {
  localBytes: number;
  localOffsets: number[];
  paramOffsets: number[];
};

type LoweringState = {
  nextLabelId: number;
};

type StatementSpec =
  | { kind: "call"; target: string }
  | { kind: "loadConstHl"; value: number }
  | { kind: "loadDataAddressHl"; label: string }
  | { kind: "loadExprHl"; expr: ExprSpec }
  | { kind: "pushExprArg"; expr: ExprSpec }
  | { kind: "pushHlArg" }
  | { kind: "popBc" }
  | { kind: "ret" }
  | { kind: "callWithModeA"; target: string; mode: number }
  | { kind: "truthJumpZero"; target: string }
  | { kind: "label"; name: string }
  | { kind: "jump"; target: string }
  | { kind: "decSp" }
  | { kind: "incSp" }
  | { kind: "reserveBytes"; count: number }
  | { kind: "releaseBytes"; count: number }
  | { kind: "loadLocalAddrHl"; offset: number }
  | { kind: "storeImmToLocal"; offset: number; value: number }
  | { kind: "storeExprToLocalByte"; offset: number; expr: ExprSpec }
  | { kind: "loadLocalCharToHl"; offset: number }
  | { kind: "storeImm16ToLocal"; offset: number; value: number }
  | { kind: "storeExprToLocalWord"; offset: number; expr: ExprSpec }
  | { kind: "loadLocalIntToHl"; offset: number }
  | { kind: "decLocalByte"; offset: number }
  | { kind: "compareExprHelper"; left: ExprSpec; right: ExprSpec; helper: string };

type EmitExprContext = {
  stackDelta: number;
};

export class TsSccCompilerAdapter implements CompilerAdapter {
  private readonly fixtureId?: string;

  constructor(opts: TsSccCompilerAdapterOptions = {}) {
    this.fixtureId = opts.fixtureId;
  }

  compileToRel(logger: Logger, opts: CompilerAdapterCompileOptions): CompileSccSourceResult {
    if (this.fixtureId) {
      return compileFromFixture(logger, opts, this.fixtureId);
    }
    return compileFromSource(logger, opts);
  }
}

function describeFixture(fixtureId: string): string {
  const fixture = getSccFixture(fixtureId);
  return `${fixture.id} [${fixture.features.join(", ")}]`;
}

function compileFromFixture(
  logger: Logger,
  opts: CompilerAdapterCompileOptions,
  fixtureId: string,
): CompileSccSourceResult {
  const fixture = getSccFixture(fixtureId);
  const resolvedInput = path.resolve(opts.inputFile);
  const stageRoot = path.resolve(opts.tempDir);
  const stem = sanitizeStageStem(path.basename(resolvedInput, path.extname(resolvedInput)).toLowerCase());
  const stageDir = path.join(stageRoot, stem);
  const preprocessedFile = path.join(stageDir, `${stem}.i`);
  const sccAsmFile = path.join(stageDir, `${stem}.scc.asm`);
  const asmFile = path.join(stageDir, `${stem}.asm`);
  const relFile = opts.outputRelFile ? path.resolve(opts.outputRelFile) : path.join(stageDir, `${stem}.rel`);

  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(preprocessedFile, `; fixture-backed TS compiler input for ${fixture.id}\n`, "utf8");
  fs.writeFileSync(sccAsmFile, emitFixtureBackedSccAsm(fixtureId), "utf8");
  fs.writeFileSync(
    asmFile,
    translateSccAsm(fs.readFileSync(sccAsmFile, "utf8"), { moduleName: path.basename(fixture.file) }),
    "utf8",
  );

  fs.mkdirSync(path.dirname(relFile), { recursive: true });
  const ctx = assemble(logger, asmFile, relFile, {
    relVersion: 2,
    verbose: opts.verbose,
    sym: opts.sym,
    lst: false,
    smap: opts.smap,
  });
  if (ctx.errors.length > 0) {
    throw new Error(`TS fixture assembly failed for ${fixture.id}: ${ctx.errors.map((entry) => entry.message).join("; ")}`);
  }

  return {
    inputFile: resolvedInput,
    preprocessedFile,
    sccAsmFile,
    asmFile,
    relFile,
    stageDir,
  };
}

function compileFromSource(
  logger: Logger,
  opts: CompilerAdapterCompileOptions,
): CompileSccSourceResult {
  const resolvedInput = path.resolve(opts.inputFile);
  const stageRoot = path.resolve(opts.tempDir);
  const stem = sanitizeStageStem(path.basename(resolvedInput, path.extname(resolvedInput)).toLowerCase());
  const stageDir = path.join(stageRoot, stem);
  const preprocessedFile = path.join(stageDir, `${stem}.i`);
  const sccAsmFile = path.join(stageDir, `${stem}.scc.asm`);
  const asmFile = path.join(stageDir, `${stem}.asm`);
  const relFile = opts.outputRelFile ? path.resolve(opts.outputRelFile) : path.join(stageDir, `${stem}.rel`);

  const sourceText = fs.readFileSync(resolvedInput, "utf8");
  const parsed = parseProgram(sourceText, resolvedInput);
  const bound = analyzeProgram(parsed, sourceText, resolvedInput);
  const spec = lowerBoundProgram(bound, `${stem}.i`, sourceText, resolvedInput);

  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(preprocessedFile, sourceText, "utf8");
  fs.writeFileSync(sccAsmFile, emitLoweredProgram(spec), "utf8");
  fs.writeFileSync(
    asmFile,
    translateSccAsm(fs.readFileSync(sccAsmFile, "utf8"), { moduleName: path.basename(preprocessedFile) }),
    "utf8",
  );

  fs.mkdirSync(path.dirname(relFile), { recursive: true });
  const ctx = assemble(logger, asmFile, relFile, {
    relVersion: 2,
    verbose: opts.verbose,
    sym: opts.sym,
    lst: false,
    smap: opts.smap,
  });
  if (ctx.errors.length > 0) {
    throw new Error(`TS source assembly failed for ${resolvedInput}: ${ctx.errors.map((entry) => entry.message).join("; ")}`);
  }

  return {
    inputFile: resolvedInput,
    preprocessedFile,
    sccAsmFile,
    asmFile,
    relFile,
    stageDir,
  };
}

function sanitizeStageStem(stem: string): string {
  return stem.replace(/[^a-z0-9_.$@]/gi, "_");
}

function parseSubsetProgram(sourceText: string): SourceProgram {
  const normalized = stripLineComments(sourceText);
  const functions: SourceFunction[] = [];
  const headerPattern = /\b(int|char)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(normalized)) !== null) {
    const bodyStart = headerPattern.lastIndex;
    const bodyEnd = findMatchingBraceIndex(normalized, bodyStart - 1);
    const bodyText = normalized.slice(bodyStart, bodyEnd);
    const parsedBody = parseSubsetBody(bodyText, match[2]);
    functions.push({
      name: match[2],
      returnType: match[1] as ScalarType,
      params: parseSubsetParams(match[3], match[2]),
      locals: parsedBody.locals,
      body: parsedBody.statements,
    });
    headerPattern.lastIndex = bodyEnd + 1;
  }
  if (functions.length === 0) {
    throw new Error("TsSccCompilerAdapter Phase C subset could not find any supported function definitions.");
  }
  return { functions };
}

function stripLineComments(sourceText: string): string {
  return sourceText.replace(/\/\/.*$/gm, "");
}

function findMatchingBraceIndex(sourceText: string, openBraceIndex: number): number {
  let depth = 0;
  for (let index = openBraceIndex; index < sourceText.length; index += 1) {
    const ch = sourceText[index];
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error("TsSccCompilerAdapter Phase C subset found an unmatched '{' in source input.");
}

function parseSubsetBody(bodyText: string, functionName: string): { locals: SourceLocal[]; statements: SourceStmt[] } {
  const trimmed = bodyText.trim();
  const ifElseIfBraceBlockMatch = /^if\s*\(([\s\S]+?)\)\s*\{([\s\S]*?)\}\s*else\s*(if[\s\S]+)$/.exec(trimmed);
  if (ifElseIfBraceBlockMatch) {
    const thenBranch = parseSubsetBranchBlock(ifElseIfBraceBlockMatch[2], functionName);
    const elseBranch = parseSubsetElseBody(ifElseIfBraceBlockMatch[3], functionName);
    return {
      locals: [...thenBranch.locals, ...elseBranch.locals],
      statements: [{
        kind: "if",
        condition: parseSubsetExpr(ifElseIfBraceBlockMatch[1], functionName),
        thenBody: thenBranch.statements,
        elseBody: elseBranch.statements,
      }],
    };
  }
  const ifElseIfReturnMatch = /^if\s*\(([\s\S]+?)\)\s*return\s+(.+?)\s*;\s*else\s*(if[\s\S]+)$/.exec(trimmed);
  if (ifElseIfReturnMatch) {
    const elseBranch = parseSubsetElseBody(ifElseIfReturnMatch[3], functionName);
    return {
      locals: elseBranch.locals,
      statements: [{
        kind: "if",
        condition: parseSubsetExpr(ifElseIfReturnMatch[1], functionName),
        thenBody: [parseReturnStmt(ifElseIfReturnMatch[2], functionName)],
        elseBody: elseBranch.statements,
      }],
    };
  }
  const ifElseBraceBlockMatch = /^if\s*\(([\s\S]+?)\)\s*\{([\s\S]*?)\}\s*else\s*\{([\s\S]*?)\}\s*$/.exec(trimmed);
  if (ifElseBraceBlockMatch) {
    const thenBranch = parseSubsetBranchBlock(ifElseBraceBlockMatch[2], functionName);
    const elseBranch = parseSubsetBranchBlock(ifElseBraceBlockMatch[3], functionName);
    return {
      locals: [...thenBranch.locals, ...elseBranch.locals],
      statements: [{
        kind: "if",
        condition: parseSubsetExpr(ifElseBraceBlockMatch[1], functionName),
        thenBody: thenBranch.statements,
        elseBody: elseBranch.statements,
      }],
    };
  }
  const ifFallthroughBraceBlockMatch = /^if\s*\(([\s\S]+?)\)\s*\{([\s\S]*?)\}\s*return\s+(.+?)\s*;?\s*$/.exec(trimmed);
  if (ifFallthroughBraceBlockMatch) {
    const thenBranch = parseSubsetBranchBlock(ifFallthroughBraceBlockMatch[2], functionName);
    return {
      locals: thenBranch.locals,
      statements: [{
        kind: "if",
        condition: parseSubsetExpr(ifFallthroughBraceBlockMatch[1], functionName),
        thenBody: thenBranch.statements,
        elseBody: [parseReturnStmt(ifFallthroughBraceBlockMatch[3], functionName)],
      }],
    };
  }
  const ifElseBraceMatch = /^if\s*\(([\s\S]+?)\)\s*\{\s*return\s+(.+?)\s*;\s*\}\s*else\s*\{\s*return\s+(.+?)\s*;\s*\}\s*;?\s*$/.exec(trimmed);
  if (ifElseBraceMatch) {
    return {
      locals: [],
      statements: [buildIfReturnStmt(ifElseBraceMatch[1], ifElseBraceMatch[2], ifElseBraceMatch[3], functionName)],
    };
  }
  const ifFallthroughBraceMatch = /^if\s*\(([\s\S]+?)\)\s*\{\s*return\s+(.+?)\s*;\s*\}\s*return\s+(.+?)\s*;?\s*$/.exec(trimmed);
  if (ifFallthroughBraceMatch) {
    return {
      locals: [],
      statements: [buildIfReturnStmt(ifFallthroughBraceMatch[1], ifFallthroughBraceMatch[2], ifFallthroughBraceMatch[3], functionName)],
    };
  }
  const ifElseMatch = /^if\s*\(([\s\S]+?)\)\s*return\s+(.+?)\s*;\s*else\s*return\s+(.+?)\s*;?\s*$/.exec(trimmed);
  if (ifElseMatch) {
    return {
      locals: [],
      statements: [buildIfReturnStmt(ifElseMatch[1], ifElseMatch[2], ifElseMatch[3], functionName)],
    };
  }
  const ifFallthroughMatch = /^if\s*\(([\s\S]+?)\)\s*return\s+(.+?)\s*;\s*return\s+(.+?)\s*;?\s*$/.exec(trimmed);
  if (ifFallthroughMatch) {
    return {
      locals: [],
      statements: [buildIfReturnStmt(ifFallthroughMatch[1], ifFallthroughMatch[2], ifFallthroughMatch[3], functionName)],
    };
  }
  const returnMatch = /^return\s+(.+?)\s*;?\s*$/.exec(trimmed);
  if (!returnMatch) {
    return parseSubsetStatementSequence(trimmed, functionName);
  }
  return { locals: [], statements: [parseReturnStmt(returnMatch[1], functionName)] };
}

function parseReturnStmt(exprText: string, functionName: string): SourceStmt {
  return {
    kind: "return",
    expr: parseSubsetExpr(exprText, functionName),
  };
}

function buildIfReturnStmt(
  conditionText: string,
  thenExprText: string,
  elseExprText: string,
  functionName: string,
): SourceStmt {
  return {
    kind: "if",
    condition: parseSubsetExpr(conditionText, functionName),
    thenBody: [parseReturnStmt(thenExprText, functionName)],
    elseBody: [parseReturnStmt(elseExprText, functionName)],
  };
}

function parseSubsetStatementSequence(
  bodyText: string,
  functionName: string,
): { locals: SourceLocal[]; statements: SourceStmt[] } {
  const locals: SourceLocal[] = [];
  const statements: SourceStmt[] = [];
  for (const statementText of splitTopLevelStatements(bodyText)) {
    if (/^if\b/.test(statementText)) {
      const parsedIf = parseSubsetBody(statementText, functionName);
      locals.push(...parsedIf.locals);
      statements.push(...parsedIf.statements);
      continue;
    }
    if (/^while\b/.test(statementText)) {
      const parsedWhile = parseSubsetWhileStmt(statementText, functionName);
      locals.push(...parsedWhile.locals);
      statements.push(parsedWhile.statement);
      continue;
    }
    const localDeclMatch = /^(int|char)\s+([A-Za-z_]\w*)(?:\s*=\s*(.+))?$/.exec(statementText);
    if (localDeclMatch) {
      const local: SourceLocal = {
        type: localDeclMatch[1] as ScalarType,
        name: localDeclMatch[2],
      };
      locals.push(local);
      if (localDeclMatch[3]) {
        statements.push({
          kind: "assign",
          name: local.name,
          expr: parseSubsetExpr(localDeclMatch[3], functionName),
        });
      }
      continue;
    }
    const assignMatch = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(statementText);
    if (assignMatch) {
      statements.push({
        kind: "assign",
        name: assignMatch[1],
        expr: parseSubsetExpr(assignMatch[2], functionName),
      });
      continue;
    }
    const returnMatch = /^return\s+(.+)$/.exec(statementText);
    if (returnMatch) {
      statements.push(parseReturnStmt(returnMatch[1], functionName));
      continue;
    }
    throw new Error(`TsSccCompilerAdapter Phase C subset does not support statement '${statementText}' in ${functionName}().`);
  }
  if (statements.length === 0) {
    throw new Error(`TsSccCompilerAdapter Phase C subset found no executable statements in ${functionName}().`);
  }
  return { locals, statements };
}

function parseSubsetBranchBlock(bodyText: string, functionName: string): { locals: SourceLocal[]; statements: SourceStmt[] } {
  return parseSubsetStatementSequence(bodyText.trim(), functionName);
}

function parseSubsetElseBody(bodyText: string, functionName: string): { locals: SourceLocal[]; statements: SourceStmt[] } {
  return parseSubsetBody(bodyText.trim(), functionName);
}

function parseSubsetWhileStmt(statementText: string, functionName: string): { locals: SourceLocal[]; statement: SourceStmt } {
  const trimmed = statementText.trim();
  const braceMatch = /^while\s*\(([\s\S]+?)\)\s*\{([\s\S]*)\}$/.exec(trimmed);
  if (braceMatch) {
    const body = parseSubsetBranchBlock(braceMatch[2], functionName);
    return {
      locals: body.locals,
      statement: {
        kind: "while",
        condition: parseSubsetExpr(braceMatch[1], functionName),
        body: body.statements,
      },
    };
  }
  const singleStmtMatch = /^while\s*\(([\s\S]+?)\)\s*(.+)$/.exec(trimmed);
  if (!singleStmtMatch) {
    throw new Error(`TsSccCompilerAdapter Phase C subset could not parse while statement in ${functionName}().`);
  }
  const body = parseSubsetBranchBlock(singleStmtMatch[2], functionName);
  return {
    locals: body.locals,
    statement: {
      kind: "while",
      condition: parseSubsetExpr(singleStmtMatch[1], functionName),
      body: body.statements,
    },
  };
}

function parseSubsetExpr(exprText: string, functionName: string): SourceExpr {
  const trimmed = exprText.trim();
  const compareOp = findTopLevelCompareOp(trimmed);
  if (compareOp) {
    return {
      kind: "compare",
      left: parseSubsetExpr(trimmed.slice(0, compareOp.index), functionName),
      right: parseSubsetExpr(trimmed.slice(compareOp.index + compareOp.op.length), functionName),
      op: compareOp.op,
    };
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
      args: parseSubsetCallArgs(callMatch[2], functionName),
    };
  }
  throw new Error(`TsSccCompilerAdapter Phase C subset does not support expression '${trimmed}' in ${functionName}().`);
}

function parseSubsetCallArgs(argsText: string, functionName: string): SourceExpr[] {
  const trimmed = argsText.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return splitTopLevelArgs(trimmed).map((arg) => parseSubsetExpr(arg, functionName));
}

function splitTopLevelArgs(argsText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < argsText.length; index += 1) {
    const ch = argsText[index];
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      continue;
    }
    if (ch === "," && depth === 0) {
      parts.push(argsText.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(argsText.slice(start).trim());
  return parts.filter((part) => part.length > 0);
}

function splitTopLevelStatements(bodyText: string): string[] {
  const parts: string[] = [];
  let parenDepth = 0;
  let braceDepth = 0;
  let start = 0;
  for (let index = 0; index < bodyText.length; index += 1) {
    const ch = bodyText[index];
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
          const statement = bodyText.slice(start, index + 1).trim();
          if (statement.length > 0) {
            parts.push(statement);
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
      const statement = bodyText.slice(start, index).trim();
      if (statement.length > 0) {
        parts.push(statement);
      }
      start = index + 1;
    }
  }
  const tail = bodyText.slice(start).trim();
  if (tail.length > 0) {
    parts.push(tail);
  }
  return parts;
}

function findTopLevelCompareOp(exprText: string): { index: number; op: "==" | "!=" | ">" | "<" | ">=" | "<=" } | null {
  let depth = 0;
  for (let index = 0; index < exprText.length; index += 1) {
    const ch = exprText[index];
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      continue;
    }
    if (depth !== 0) {
      continue;
    }
    const twoChar = exprText.slice(index, index + 2);
    if (twoChar === "==" || twoChar === "!=" || twoChar === ">=" || twoChar === "<=") {
      return { index, op: twoChar as "==" | "!=" | ">=" | "<=" };
    }
    if (ch === ">" || ch === "<") {
      return { index, op: ch as ">" | "<" };
    }
  }
  return null;
}

function parseSubsetParams(paramsText: string, functionName: string): SourceParam[] {
  const trimmed = paramsText.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return splitTopLevelArgs(trimmed).map((part) => parseSubsetParam(part, functionName));
}

function parseSubsetParam(paramText: string, functionName: string): SourceParam {
  const match = /^(int|char)\s+([A-Za-z_]\w*)$/.exec(paramText.trim());
  if (!match) {
    throw new Error(`TsSccCompilerAdapter Phase C subset does not support parameter '${paramText.trim()}' in ${functionName}().`);
  }
  return {
    type: match[1] as ScalarType,
    name: match[2],
  };
}

function lowerSourceProgram(program: SourceProgram, moduleName: string): ProgramSpec {
  validateSourceProgram(program);
  const definedFunctions = new Set(program.functions.map((fn) => fn.name));
  const externs = new Set<string>();
  const signatureMap = new Map(program.functions.map((fn) => [fn.name, fn.params]));
  const loweredFunctions = program.functions.map((fn) => lowerSourceFunction(fn, externs, definedFunctions, signatureMap));
  return {
    moduleName,
    exports: definedFunctions.has("main") ? ["main"] : [],
    externs: Array.from(externs),
    functions: loweredFunctions,
    includeBss: true,
  };
}

function validateSourceProgram(program: SourceProgram): void {
  const seenFunctions = new Set<string>();
  for (const fn of program.functions) {
    if (seenFunctions.has(fn.name)) {
      throw new Error(`TsSccCompilerAdapter Phase C subset does not support duplicate function '${fn.name}()'.`);
    }
    seenFunctions.add(fn.name);
    validateSourceFunctionSymbols(fn);
  }
}

function validateSourceFunctionSymbols(fn: SourceFunction): void {
  const seenParams = new Set<string>();
  for (const param of fn.params) {
    if (seenParams.has(param.name)) {
      throw new Error(`TsSccCompilerAdapter Phase C subset does not support duplicate parameter '${param.name}' in ${fn.name}().`);
    }
    seenParams.add(param.name);
  }

  const seenLocals = new Set<string>();
  for (const local of fn.locals) {
    if (seenParams.has(local.name)) {
      throw new Error(`TsSccCompilerAdapter Phase C subset does not support local '${local.name}' shadowing a parameter in ${fn.name}().`);
    }
    if (seenLocals.has(local.name)) {
      throw new Error(`TsSccCompilerAdapter Phase C subset does not support duplicate local '${local.name}' in ${fn.name}().`);
    }
    seenLocals.add(local.name);
  }
}

function lowerSourceFunction(
  fn: SourceFunction,
  externs: Set<string>,
  definedFunctions: Set<string>,
  signatureMap: Map<string, SourceParam[]>,
): FunctionSpec {
  const paramSlots = new Map(
    fn.params.map((param, index) => [param.name, { slot: index, width: scalarTypeWidth(param.type) }] as const),
  );
  const localSlots = new Map(
    fn.locals.map((local, index) => [local.name, { slot: index, width: scalarTypeWidth(local.type) }] as const),
  );
  return lowerFunctionIR({
    name: fn.name,
    params: fn.params.map((param) => scalarTypeWidth(param.type)),
    locals: fn.locals.map((local) => scalarTypeWidth(local.type)),
    body: fn.body.map((stmt) => lowerSourceStmt(stmt, externs, definedFunctions, signatureMap, paramSlots, localSlots)),
  });
}

function lowerSourceStmt(
  stmt: SourceStmt,
  externs: Set<string>,
  definedFunctions: Set<string>,
  signatureMap: Map<string, SourceParam[]>,
  paramSlots: Map<string, { slot: number; width: ValueWidth }>,
  localSlots: Map<string, { slot: number; width: ValueWidth }>,
): StmtIRHigh {
  switch (stmt.kind) {
    case "return":
      return { kind: "returnExpr", expr: lowerSourceExpr(stmt.expr, externs, definedFunctions, signatureMap, paramSlots, localSlots) };
    case "if":
      return {
        kind: "ifExprZero",
        expr: lowerSourceExpr(stmt.condition, externs, definedFunctions, signatureMap, paramSlots, localSlots),
        thenBody: stmt.thenBody.map((entry) => lowerSourceStmt(entry, externs, definedFunctions, signatureMap, paramSlots, localSlots)),
        elseBody: stmt.elseBody.map((entry) => lowerSourceStmt(entry, externs, definedFunctions, signatureMap, paramSlots, localSlots)),
      };
    case "while": {
      const loweredCondition = lowerSourceExpr(stmt.condition, externs, definedFunctions, signatureMap, paramSlots, localSlots);
      const loweredBody = stmt.body.map((entry) => lowerSourceStmt(entry, externs, definedFunctions, signatureMap, paramSlots, localSlots));
      return {
        kind: "ifExprZero",
        expr: loweredCondition,
        thenBody: [{
          kind: "doWhileExprNonZero",
          body: loweredBody,
          expr: loweredCondition,
        }],
        elseBody: [],
      };
    }
    case "assign": {
      const slot = localSlots.get(stmt.name);
      if (!slot) {
        throw new Error(`TsSccCompilerAdapter Phase C subset only supports assignment to local symbols, got '${stmt.name}'.`);
      }
      if (stmt.expr.kind === "const") {
        return {
          kind: "assignLocalConst",
          slot: slot.slot,
          width: slot.width,
          value: stmt.expr.value,
        };
      }
      return {
        kind: "assignLocalExpr",
        slot: slot.slot,
        width: slot.width,
        expr: lowerSourceExpr(stmt.expr, externs, definedFunctions, signatureMap, paramSlots, localSlots),
      };
    }
    default:
      return assertNever(stmt);
  }
}

function lowerSourceExpr(
  expr: SourceExpr,
  externs: Set<string>,
  definedFunctions: Set<string>,
  signatureMap: Map<string, SourceParam[]>,
  paramSlots: Map<string, { slot: number; width: ValueWidth }>,
  localSlots: Map<string, { slot: number; width: ValueWidth }>,
): ExprIR {
  switch (expr.kind) {
    case "const":
      return { kind: "const", value: expr.value };
    case "ref": {
      const localSlot = localSlots.get(expr.name);
      if (localSlot) {
        return { kind: "ref", scope: "local", width: localSlot.width, slot: localSlot.slot };
      }
      const paramSlot = paramSlots.get(expr.name);
      if (!paramSlot) {
        throw new Error(`TsSccCompilerAdapter Phase C subset does not know symbol '${expr.name}'.`);
      }
      return { kind: "ref", scope: "arg", width: paramSlot.width, slot: paramSlot.slot };
    }
    case "compare": {
      const helper = compareOpToHelper(expr.op);
      externs.add(helper);
      return {
        kind: "compare",
        left: lowerSourceExpr(expr.left, externs, definedFunctions, signatureMap, paramSlots, localSlots),
        right: lowerSourceExpr(expr.right, externs, definedFunctions, signatureMap, paramSlots, localSlots),
        helper,
      };
    }
    case "call":
      if (!definedFunctions.has(expr.target)) {
        externs.add(expr.target);
      }
      const calleeParams = signatureMap.get(expr.target);
      if (calleeParams && calleeParams.length !== expr.args.length) {
        throw new Error(
          `TsSccCompilerAdapter Phase C subset expected ${calleeParams.length} argument(s) for ${expr.target}(), got ${expr.args.length}.`,
        );
      }
      return {
        kind: "call",
        target: expr.target,
        args: expr.args.map((arg) => lowerSourceExpr(arg, externs, definedFunctions, signatureMap, paramSlots, localSlots)),
      };
    default:
      return assertNever(expr);
  }
}

function scalarTypeWidth(type: ScalarType): ValueWidth {
  return type === "char" ? 1 : 2;
}

function compareOpToHelper(op: "==" | "!=" | ">" | "<" | ">=" | "<="): string {
  switch (op) {
    case "==":
      return ".eq";
    case "!=":
      return ".ne";
    case ">":
      return ".gt";
    case "<":
      return ".lt";
    case ">=":
      return ".ge";
    case "<=":
      return ".le";
    default:
      return assertNever(op);
  }
}

function emitFixtureBackedSccAsm(fixtureId: string): string {
  const spec = makeFixtureProgramSpec(fixtureId);
  if (spec) return emitProgram(spec);
  return readSccFixture(fixtureId);
}

function makeFixtureProgramSpec(fixtureId: string): ProgramSpec | null {
  switch (fixtureId) {
    case "frag-helper-call-scc":
      return {
        moduleName: "frag_helper_call.i",
        exports: [".gint", "main"],
        includeBss: true,
        functions: [lowerFunctionIR({
          name: "main",
          params: [],
          locals: [],
          body: [
            { kind: "returnExpr", expr: { kind: "call", target: ".gint" } },
          ],
        })],
      };
    default:
      return null;
  }
}

function emitProgram(spec: ProgramSpec): string {
  const lines: string[] = [];
  const exports = spec.exports ?? [];
  for (const exp of exports) {
    lines.push(`\t.globl\t${exp}`);
  }
  for (const ext of spec.externs ?? []) {
    lines.push(`\t.globl\t${ext}`);
  }
  lines.push(`\t.module\t${spec.moduleName}`);
  lines.push("\t.area\t_CODE");
  for (const fn of spec.functions) {
    lines.push(...emitFunction(fn));
  }
  if (spec.data && spec.data.length > 0) {
    lines.push("\t.area\t_DATA");
    for (const item of spec.data) {
      lines.push(`${item.label}:\t${item.directive}\t${item.value}`);
    }
  }
  if (spec.includeBss) {
    lines.push("\t.area\t_BSS");
  }
  lines.push("");
  return lines.join("\n");
}

function lowerFunctionIR(fn: FunctionIR): FunctionSpec {
  const layout = layoutFunction(fn);
  const state: LoweringState = { nextLabelId: 2 };
  const statements: StatementSpec[] = [];
  if (layout.localBytes > 0) {
    statements.push({ kind: "reserveBytes", count: layout.localBytes });
  }
  for (const stmt of fn.body) {
    statements.push(...lowerStmtIR(stmt, layout, state));
  }
  return {
    name: fn.name,
    statements,
  };
}

function lowerStmtIR(stmt: StmtIRHigh, layout: FunctionLayout, state: LoweringState): StatementSpec[] {
  switch (stmt.kind) {
    case "assignLocalConst": {
      const offset = getLocalOffset(layout, stmt.slot);
      return stmt.width === 1
        ? [{ kind: "storeImmToLocal", offset, value: stmt.value }]
        : [{ kind: "storeImm16ToLocal", offset, value: stmt.value }];
    }
    case "assignLocalExpr": {
      const offset = getLocalOffset(layout, stmt.slot);
      const expr = lowerExprIR(stmt.expr, layout);
      return stmt.width === 1
        ? [{ kind: "storeExprToLocalByte", offset, expr }]
        : [{ kind: "storeExprToLocalWord", offset, expr }];
    }
    case "compareReturn": {
      const statements: StatementSpec[] = [
        {
          kind: "compareExprHelper",
          left: lowerExprIR(stmt.left, layout),
          right: lowerExprIR(stmt.right, layout),
          helper: stmt.helper,
        },
      ];
      if (layout.localBytes > 0) {
        statements.push({ kind: "releaseBytes", count: layout.localBytes });
      }
      statements.push({ kind: "ret" });
      return statements;
    }
    case "returnExpr": {
      const statements: StatementSpec[] = [
        { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
      ];
      if (layout.localBytes > 0) {
        statements.push({ kind: "releaseBytes", count: layout.localBytes });
      }
      statements.push({ kind: "ret" });
      return statements;
    }
    case "returnVoid": {
      const statements: StatementSpec[] = [];
      if (layout.localBytes > 0) {
        statements.push({ kind: "releaseBytes", count: layout.localBytes });
      }
      statements.push({ kind: "ret" });
      return statements;
    }
    case "emitExprChar":
      return [
        { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
        { kind: "pushHlArg" },
        { kind: "callWithModeA", target: "outchar", mode: 1 },
        { kind: "popBc" },
      ];
    case "callModeAArg":
      return [
        { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
        { kind: "pushHlArg" },
        { kind: "callWithModeA", target: stmt.target, mode: stmt.mode },
        { kind: "popBc" },
      ];
    case "decLocalByte":
      return [{ kind: "decLocalByte", offset: getLocalOffset(layout, stmt.slot) }];
    case "emitChar":
      return [
        { kind: "loadConstHl", value: stmt.value },
        { kind: "pushHlArg" },
        { kind: "callWithModeA", target: "outchar", mode: 1 },
        { kind: "popBc" },
      ];
    case "doWhileExprNonZero": {
      const loopLabel = allocateNumericLabel(state);
      const endLabel = allocateNumericLabel(state);
      return [
        { kind: "label", name: loopLabel },
        ...stmt.body.flatMap((entry) => lowerStmtIR(entry, layout, state)),
        { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
        { kind: "truthJumpZero", target: endLabel },
        { kind: "jump", target: loopLabel },
        { kind: "label", name: endLabel },
      ];
    }
    case "ifExprZero": {
      const elseLabel = allocateNumericLabel(state);
      const endLabel = allocateNumericLabel(state);
      return [
        { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
        { kind: "truthJumpZero", target: elseLabel },
        ...stmt.thenBody.flatMap((entry) => lowerStmtIR(entry, layout, state)),
        { kind: "jump", target: endLabel },
        { kind: "label", name: elseLabel },
        ...stmt.elseBody.flatMap((entry) => lowerStmtIR(entry, layout, state)),
        { kind: "label", name: endLabel },
      ];
    }
    default:
      return assertNever(stmt);
  }
}

function allocateNumericLabel(state: LoweringState): string {
  const label = `.${state.nextLabelId}`;
  state.nextLabelId += 1;
  return label;
}

function lowerExprIR(expr: ExprIR, layout: FunctionLayout): ExprSpec {
  switch (expr.kind) {
    case "const":
      return { kind: "const", value: expr.value };
    case "dataAddress":
      return { kind: "dataAddress", label: expr.label };
    case "compare":
      return {
        kind: "compare",
        left: lowerExprIR(expr.left, layout),
        right: lowerExprIR(expr.right, layout),
        helper: expr.helper,
      };
    case "call":
      return {
        kind: "call",
        target: expr.target,
        args: expr.args?.map((arg) => lowerExprIR(arg, layout)),
      };
    case "ref":
      return lowerRefIR(expr, layout);
    default:
      return assertNever(expr);
  }
}

function lowerRefIR(ref: RefIR, layout: FunctionLayout): ExprSpec {
  const offset = ref.scope === "local"
    ? getLocalOffset(layout, ref.slot)
    : getParamOffset(layout, ref.slot);
  if (ref.scope === "local") {
    return ref.width === 1
      ? { kind: "localChar", offset }
      : { kind: "localInt", offset };
  }
  return ref.width === 1
    ? { kind: "argChar", offset }
    : { kind: "argInt", offset };
}

function layoutFunction(fn: FunctionIR): FunctionLayout {
  const localOffsets: number[] = [];
  let localRunning = 0;
  for (const width of fn.locals) {
    localOffsets.push(localRunning);
    localRunning += width;
  }
  const localBytes = localRunning;

  const paramOffsets: number[] = [];
  for (let index = 0; index < fn.params.length; index += 1) {
    let trailing = 0;
    for (let next = index + 1; next < fn.params.length; next += 1) {
      trailing += getParamStackBytes(fn.params[next]);
    }
    paramOffsets.push(localBytes + 2 + trailing);
  }
  return { localBytes, localOffsets, paramOffsets };
}

function getParamStackBytes(_width: ValueWidth): number {
  return 2;
}

function getLocalOffset(layout: FunctionLayout, slot: number): number {
  return layout.localOffsets[slot] ?? 0;
}

function getParamOffset(layout: FunctionLayout, slot: number): number {
  return layout.paramOffsets[slot] ?? 0;
}

function emitFunction(fn: FunctionSpec): string[] {
  const lines = [`${fn.name}:`];
  for (const statement of fn.statements) {
    lines.push(...emitStatement(statement, { stackDelta: 0 }));
  }
  return lines;
}

function emitStatement(statement: StatementSpec, ctx: EmitExprContext): string[] {
  switch (statement.kind) {
    case "call":
      return emitCall(statement.target);
    case "loadConstHl":
      return emitExprToHl({ kind: "const", value: statement.value }, ctx);
    case "loadDataAddressHl":
      return emitExprToHl({ kind: "dataAddress", label: statement.label }, ctx);
    case "loadExprHl":
      return emitExprToHl(statement.expr, ctx);
    case "pushExprArg":
      return emitPushArgs([statement.expr], ctx);
    case "pushHlArg":
      return emitPushHlArg();
    case "popBc":
      return emitPopBc();
    case "ret":
      return emitRet();
    case "callWithModeA":
      return emitCallWithModeA(statement.target, statement.mode);
    case "truthJumpZero":
      return emitTruthJumpZero(statement.target);
    case "label":
      return emitLabel(statement.name);
    case "jump":
      return emitJump(statement.target);
    case "decSp":
      return emitReserveBytes(1);
    case "incSp":
      return emitReleaseBytes(1);
    case "reserveBytes":
      return emitReserveBytes(statement.count);
    case "releaseBytes":
      return emitReleaseBytes(statement.count);
    case "loadLocalAddrHl":
      return emitLoadLocalAddrToHl(statement.offset, ctx);
    case "storeImmToLocal":
      return emitStoreImm8ToLocal(statement.offset, statement.value, ctx);
    case "storeExprToLocalByte":
      return emitStoreExprToLocalByte(statement.offset, statement.expr, ctx);
    case "loadLocalCharToHl":
      return emitExprToHl({ kind: "localChar", offset: statement.offset }, ctx);
    case "storeImm16ToLocal":
      return emitStoreImm16ToLocal(statement.offset, statement.value, ctx);
    case "storeExprToLocalWord":
      return emitStoreExprToLocalWord(statement.offset, statement.expr, ctx);
    case "loadLocalIntToHl":
      return emitExprToHl({ kind: "localInt", offset: statement.offset }, ctx);
    case "decLocalByte":
      return emitDecLocalByte(statement.offset, ctx);
    case "compareExprHelper":
      return emitHelperCompare(statement.left, statement.right, statement.helper, ctx);
    default:
      return assertNever(statement);
  }
}

function emitExprToHl(expr: ExprSpec, ctx: EmitExprContext): string[] {
  switch (expr.kind) {
    case "const":
      return emitConstToHl(expr.value);
    case "dataAddress":
      return emitSymbolAddressToHl(expr.label);
    case "call":
      return emitCallExpr(expr.target, expr.args ?? [], ctx);
    case "compare":
      return emitHelperCompare(expr.left, expr.right, expr.helper, ctx);
    case "localChar":
      return emitLoadLocalByteToHl(expr.offset, ctx);
    case "localInt":
      return emitLoadLocalWordToHl(expr.offset, ctx);
    case "argChar":
      return emitLoadArgByteToHl(expr.offset, ctx);
    case "argInt":
      return emitLoadArgWordToHl(expr.offset, ctx);
    default:
      return assertNever(expr);
  }
}

function emitCall(target: string): string[] {
  return [`\tcall\t${target}`];
}

function emitCallExpr(target: string, args: ExprSpec[], ctx: EmitExprContext): string[] {
  if (args.length === 0) {
    return emitCall(target);
  }
  return [
    ...emitPushArgs(args, ctx),
    ...emitCall(target),
    ...Array.from({ length: args.length }, () => emitPopBc()).flat(),
  ];
}

function emitRet(): string[] {
  return ["\tret"];
}

function emitLabel(name: string): string[] {
  return [`${name}:`];
}

function emitJump(target: string): string[] {
  return [`\tjp\t${target}`];
}

function emitCallWithModeA(target: string, mode: number): string[] {
  return [`\tld\ta,#${mode}`, `\tcall\t${target}`];
}

function emitTruthJumpZero(target: string): string[] {
  return ["\tld\ta,h", "\tor\tl", `\tjp\tz,${target}`];
}

function emitPushHlArg(): string[] {
  return ["\tpush\thl"];
}

function emitPopBc(): string[] {
  return ["\tpop\tbc"];
}

function emitPushArgs(args: ExprSpec[], ctx: EmitExprContext): string[] {
  const lines: string[] = [];
  let stackDelta = ctx.stackDelta;
  for (const expr of args) {
    lines.push(...emitExprToHl(expr, { ...ctx, stackDelta }));
    lines.push(...emitPushHlArg());
    stackDelta += 2;
  }
  return lines;
}

function emitReserveBytes(count: number): string[] {
  return Array.from({ length: count }, () => "\tdec\tsp");
}

function emitReleaseBytes(count: number): string[] {
  return Array.from({ length: count }, () => "\tinc\tsp");
}

function emitConstToHl(value: number): string[] {
  return [`\tld\thl,#${value}`];
}

function emitSymbolAddressToHl(label: string): string[] {
  return [`\tld\thl,#${label}+0`];
}

function emitLoadLocalAddrToHl(offset: number, ctx: EmitExprContext): string[] {
  return emitLoadStackAddrToHl(offset, ctx);
}

function emitLoadStackAddrToHl(offset: number, ctx: EmitExprContext): string[] {
  return [`\tld\thl,#${offset + ctx.stackDelta}`, "\tadd\thl,sp"];
}

function emitLoadStackByteToHl(offset: number, ctx: EmitExprContext): string[] {
  return [
    ...emitLoadStackAddrToHl(offset, ctx),
    "\tld\tl,(hl)",
    "\tld\th,#0",
  ];
}

function emitLoadStackWordToHl(offset: number, ctx: EmitExprContext): string[] {
  return [
    ...emitLoadStackAddrToHl(offset, ctx),
    "\tld\ta,(hl)",
    "\tinc\thl",
    "\tld\th,(hl)",
    "\tld\tl,a",
  ];
}

function emitLoadLocalByteToHl(offset: number, ctx: EmitExprContext): string[] {
  return emitLoadStackByteToHl(offset, ctx);
}

function emitLoadLocalWordToHl(offset: number, ctx: EmitExprContext): string[] {
  return emitLoadStackWordToHl(offset, ctx);
}

function emitLoadArgByteToHl(offset: number, ctx: EmitExprContext): string[] {
  return emitLoadStackByteToHl(offset, ctx);
}

function emitLoadArgWordToHl(offset: number, ctx: EmitExprContext): string[] {
  return emitLoadStackWordToHl(offset, ctx);
}

function emitStoreImm8ToLocal(offset: number, value: number, ctx: EmitExprContext): string[] {
  return [
    ...emitLoadLocalAddrToHl(offset, ctx),
    `\tld\t(hl),#${value}`,
  ];
}

function emitStoreExprToLocalByte(offset: number, expr: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(expr, ctx),
    "\tpush\thl",
    ...emitLoadLocalAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tld\t(hl),e",
  ];
}

function emitStoreImm16ToLocal(offset: number, value: number, ctx: EmitExprContext): string[] {
  return [
    ...emitLoadLocalAddrToHl(offset, ctx),
    `\tld\t(hl),#${value & 0xff}`,
    "\tinc\thl",
    `\tld\t(hl),#${(value >> 8) & 0xff}`,
  ];
}

function emitStoreExprToLocalWord(offset: number, expr: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(expr, ctx),
    "\tpush\thl",
    ...emitLoadLocalAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tld\t(hl),e",
    "\tinc\thl",
    "\tld\t(hl),d",
  ];
}

function emitDecLocalByte(offset: number, ctx: EmitExprContext): string[] {
  return [
    ...emitLoadLocalAddrToHl(offset, ctx),
    "\tdec\t(hl)",
  ];
}

function emitHelperCompare(left: ExprSpec, right: ExprSpec, helper: string, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(left, ctx),
    ...emitPushHlArg(),
    ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    `\tcall\t${helper}`,
  ];
}

function assertNever(value: never): never {
  throw new Error(`Unhandled statement kind: ${JSON.stringify(value)}`);
}

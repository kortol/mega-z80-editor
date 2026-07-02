import {
  AdditiveOp,
  CompareOp,
  ScalarType,
  SourceBlock,
  SourceExpr,
  SourceFunction,
  SourceProgram,
  SourceStmt,
} from "./tsFrontendAst";
import { throwDiagnostic } from "./tsFrontendDiagnostics";
import { ValueWidth } from "./tsProgram";

export type SemanticScalarType = {
  kind: "scalar";
  name: ScalarType;
  width: ValueWidth;
};

export type BoundFunctionSymbol = {
  kind: "function";
  name: string;
  returnType: SemanticScalarType;
  params: SemanticScalarType[];
};

export type BoundParamSymbol = {
  kind: "param";
  name: string;
  type: SemanticScalarType;
  slot: number;
};

export type BoundLocalSymbol = {
  kind: "local";
  name: string;
  type: SemanticScalarType;
  slot: number;
};

type BoundSymbol = BoundFunctionSymbol | BoundParamSymbol | BoundLocalSymbol;

export type BoundProgram = {
  kind: "boundProgram";
  functions: BoundFunction[];
};

export type BoundFunction = {
  kind: "boundFunction";
  name: string;
  returnType: SemanticScalarType;
  params: BoundParamSymbol[];
  locals: BoundLocalSymbol[];
  body: BoundBlock;
};

export type BoundBlock = {
  kind: "boundBlock";
  statements: BoundStmt[];
};

export type BoundStmt =
  | { kind: "return"; expr: BoundExpr }
  | { kind: "expr"; expr: BoundExpr }
  | { kind: "if"; condition: BoundExpr; thenBlock: BoundBlock; elseBlock?: BoundBlock }
  | { kind: "while"; condition: BoundExpr; body: BoundBlock }
  | { kind: "assign"; local: BoundLocalSymbol; expr: BoundExpr };

export type BoundExpr =
  | { kind: "const"; value: number; type: SemanticScalarType }
  | { kind: "string"; value: string; type: SemanticScalarType }
  | { kind: "ref"; symbol: BoundParamSymbol | BoundLocalSymbol; type: SemanticScalarType }
  | { kind: "call"; target: BoundFunctionSymbol | { kind: "extern"; name: string }; args: BoundExpr[]; type: SemanticScalarType }
  | { kind: "compare"; left: BoundExpr; right: BoundExpr; op: CompareOp; type: SemanticScalarType }
  | { kind: "additive"; left: BoundExpr; right: BoundExpr; op: AdditiveOp; type: SemanticScalarType };

type Scope = {
  parent?: Scope;
  entries: Map<string, BoundSymbol>;
};

export function analyzeProgram(program: SourceProgram, sourceText: string, file?: string): BoundProgram {
  const functionSymbols = new Map<string, BoundFunctionSymbol>();
  for (const fn of program.functions) {
    if (functionSymbols.has(fn.name)) {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate function '${fn.name}()'.`, {
        file,
        offset: 0,
      });
    }
    functionSymbols.set(fn.name, {
      kind: "function",
      name: fn.name,
      returnType: toSemanticType(fn.returnType.name),
      params: fn.params.map((param) => toSemanticType(param.type.name)),
    });
  }

  return {
    kind: "boundProgram",
    functions: program.functions.map((fn) => analyzeFunction(fn, functionSymbols, sourceText, file)),
  };
}

function analyzeFunction(
  fn: SourceFunction,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  sourceText: string,
  file?: string,
): BoundFunction {
  const functionScope: Scope = { entries: new Map() };
  const params: BoundParamSymbol[] = [];
  for (const [index, param] of fn.params.entries()) {
    if (functionScope.entries.has(param.name)) {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate parameter '${param.name}' in ${fn.name}().`, {
        file,
        offset: 0,
      });
    }
    const symbol: BoundParamSymbol = {
      kind: "param",
      name: param.name,
      type: toSemanticType(param.type.name),
      slot: index,
    };
    functionScope.entries.set(param.name, symbol);
    params.push(symbol);
  }

  const allLocals = new Map<string, BoundLocalSymbol>();
  const localList: BoundLocalSymbol[] = [];
  const body = analyzeBlock(fn.body, functionScope, allLocals, localList, functionSymbols, fn.name, sourceText, file);
  return {
    kind: "boundFunction",
    name: fn.name,
    returnType: toSemanticType(fn.returnType.name),
    params,
    locals: localList,
    body,
  };
}

function analyzeBlock(
  block: SourceBlock,
  parentScope: Scope,
  allLocals: Map<string, BoundLocalSymbol>,
  localList: BoundLocalSymbol[],
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundBlock {
  const scope: Scope = { parent: parentScope, entries: new Map() };
  for (const declaration of block.declarations) {
    if (lookupVisible(scope, declaration.name) || allLocals.has(declaration.name)) {
      const existing = lookupVisible(scope, declaration.name) ?? allLocals.get(declaration.name);
      if (existing?.kind === "param") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support local '${declaration.name}' shadowing a parameter in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate local '${declaration.name}' in ${functionName}().`, {
        file,
        offset: 0,
      });
    }
    const symbol: BoundLocalSymbol = {
      kind: "local",
      name: declaration.name,
      type: toSemanticType(declaration.type.name),
      slot: localList.length,
    };
    scope.entries.set(declaration.name, symbol);
    allLocals.set(declaration.name, symbol);
    localList.push(symbol);
  }

  return {
    kind: "boundBlock",
    statements: block.statements.map((stmt) => analyzeStmt(stmt, scope, allLocals, localList, functionSymbols, functionName, sourceText, file)),
  };
}

function analyzeStmt(
  stmt: SourceStmt,
  scope: Scope,
  allLocals: Map<string, BoundLocalSymbol>,
  localList: BoundLocalSymbol[],
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundStmt {
  switch (stmt.kind) {
    case "return":
      return { kind: "return", expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file) };
    case "expr":
      return { kind: "expr", expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file) };
    case "if":
      return {
        kind: "if",
        condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
        thenBlock: analyzeBlock(stmt.thenBlock, scope, allLocals, localList, functionSymbols, functionName, sourceText, file),
        elseBlock: stmt.elseBlock
          ? analyzeBlock(stmt.elseBlock, scope, allLocals, localList, functionSymbols, functionName, sourceText, file)
          : undefined,
      };
    case "while":
      return {
        kind: "while",
        condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
        body: analyzeBlock(stmt.body, scope, allLocals, localList, functionSymbols, functionName, sourceText, file),
      };
    case "assign": {
      const symbol = lookupVisible(scope, stmt.name);
      if (!symbol || symbol.kind !== "local") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local symbols, got '${stmt.name}'.`, {
          file,
          offset: 0,
        });
      }
      return {
        kind: "assign",
        local: symbol,
        expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
      };
    }
    default:
      return assertNever(stmt);
  }
}

function analyzeExpr(
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundExpr {
  switch (expr.kind) {
    case "const":
      return { kind: "const", value: expr.value, type: toSemanticType("int") };
    case "string":
      return { kind: "string", value: expr.value, type: toSemanticType("int") };
    case "ref": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param")) {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not know symbol '${expr.name}'.`, {
          file,
          offset: 0,
        });
      }
      return { kind: "ref", symbol, type: symbol.type };
    }
    case "call": {
      const target = functionSymbols.get(expr.target);
      if (target && target.params.length !== expr.args.length) {
        throwDiagnostic(
          sourceText,
          `TsSccCompilerAdapter Phase C subset expected ${target.params.length} argument(s) for ${expr.target}(), got ${expr.args.length}.`,
          { file, offset: 0 },
        );
      }
      return {
        kind: "call",
        target: target ?? { kind: "extern", name: expr.target },
        args: expr.args.map((arg) => analyzeExpr(arg, scope, functionSymbols, functionName, sourceText, file)),
        type: target?.returnType ?? toSemanticType("int"),
      };
    }
    case "binary":
      if (isCompareOp(expr.op)) {
        return {
          kind: "compare",
          left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
          right: analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file),
          op: expr.op,
          type: toSemanticType("int"),
        };
      }
      return {
        kind: "additive",
        left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
        right: analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file),
        op: expr.op,
        type: toSemanticType("int"),
      };
    default:
      return assertNever(expr);
  }
}

function lookupVisible(scope: Scope, name: string): BoundSymbol | undefined {
  let current: Scope | undefined = scope;
  while (current) {
    const symbol = current.entries.get(name);
    if (symbol) {
      return symbol;
    }
    current = current.parent;
  }
  return undefined;
}

function isCompareOp(op: CompareOp | AdditiveOp): op is CompareOp {
  return op === "==" || op === "!=" || op === ">" || op === "<" || op === ">=" || op === "<=";
}

function toSemanticType(type: ScalarType): SemanticScalarType {
  return {
    kind: "scalar",
    name: type,
    width: type === "char" ? 1 : 2,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled semantic node: ${JSON.stringify(value)}`);
}

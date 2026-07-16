import {
  AggregateKind,
  AggregateTypeRef,
  AdditiveOp,
  BitwiseOp,
  CompareOp,
  LogicalOp,
  MultiplicativeOp,
  PointerPointee,
  ScalarType,
  ShiftOp,
  SourceBlock,
  SourceExpr,
  SourceForInit,
  SourceFunction,
  SourceAggregateDef,
  SourceSimpleStmt,
  SourceProgram,
  SourceStmt,
  SourceType,
} from "./tsFrontendAst";
import { throwDiagnostic } from "./tsFrontendDiagnostics";
import { ValueWidth } from "./tsProgram";

export type SemanticScalarType = {
  kind: "scalar";
  name: ScalarType;
  width: ValueWidth;
};

export type SemanticArrayType = {
  kind: "array";
  elementType: "char";
  length?: number;
};

export type SemanticPointerType = {
  kind: "pointer";
  pointee: PointerPointee;
  width: 2;
};

export type SemanticAggregateType = {
  kind: "aggregate";
  aggregateKind: AggregateKind;
  name: string;
  size: number;
};

export type SemanticType = SemanticScalarType | SemanticArrayType | SemanticPointerType | SemanticAggregateType;

export type BoundFunctionSymbol = {
  kind: "function";
  name: string;
  returnType: SemanticType;
  params: SemanticType[];
};

export type BoundParamSymbol = {
  kind: "param";
  name: string;
  type: SemanticType;
  slot: number;
};

export type BoundLocalSymbol = {
  kind: "local";
  name: string;
  type: SemanticType;
  storageBytes: number;
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
  returnType: SemanticType;
  params: BoundParamSymbol[];
  locals: BoundLocalSymbol[];
  body: BoundBlock;
};

export type BoundBlock = {
  kind: "boundBlock";
  statements: BoundStmt[];
};

export type BoundSwitchCase = {
  kind: "boundSwitchCase";
  value: number;
  body: BoundBlock;
};

export type BoundAggregateValueExpr =
  | { kind: "aggregateRef"; symbol: (BoundLocalSymbol | BoundParamSymbol) & { type: SemanticAggregateType }; type: SemanticAggregateType }
  | { kind: "call"; target: BoundFunctionSymbol; args: BoundCallArg[]; type: SemanticAggregateType }
  | { kind: "comma"; left: BoundExpr; right: BoundAggregateValueExpr; type: SemanticAggregateType }
  | { kind: "conditional"; condition: BoundExpr; thenExpr: BoundAggregateValueExpr; elseExpr: BoundAggregateValueExpr; type: SemanticAggregateType };

export type BoundCallArg = BoundExpr | BoundAggregateValueExpr;

export type BoundStmt =
  | { kind: "return"; expr: BoundExpr | BoundAggregateValueExpr }
  | { kind: "expr"; expr: BoundExpr }
  | { kind: "if"; condition: BoundExpr; thenBlock: BoundBlock; elseBlock?: BoundBlock }
  | { kind: "while"; condition: BoundExpr; body: BoundBlock }
  | { kind: "doWhile"; body: BoundBlock; condition: BoundExpr }
  | { kind: "for"; initializer?: BoundForInit; condition?: BoundExpr; step?: BoundSimpleStmt; body: BoundBlock }
  | { kind: "switch"; expr: BoundExpr; cases: BoundSwitchCase[]; defaultCase?: BoundBlock }
  | { kind: "assign"; local: BoundLocalSymbol; expr: BoundExpr }
  | { kind: "aggregateAssign"; target: BoundLocalSymbol; source: BoundAggregateValueExpr }
  | { kind: "arrayAssign"; target: BoundLocalSymbol | BoundParamSymbol; index: BoundExpr; expr: BoundExpr }
  | { kind: "break" }
  | { kind: "continue" };

export type BoundSimpleStmt =
  | { kind: "expr"; expr: BoundExpr }
  | { kind: "assign"; local: BoundLocalSymbol; expr: BoundExpr }
  | { kind: "aggregateAssign"; target: BoundLocalSymbol; source: BoundAggregateValueExpr }
  | { kind: "arrayAssign"; target: BoundLocalSymbol | BoundParamSymbol; index: BoundExpr; expr: BoundExpr };

export type BoundForInit =
  | BoundSimpleStmt
  | { kind: "localDecl"; local: BoundLocalSymbol; initializer?: BoundExpr };

export type BoundExpr =
  | { kind: "const"; value: number; type: SemanticScalarType }
  | { kind: "string"; value: string; type: SemanticScalarType }
  | { kind: "ref"; symbol: BoundParamSymbol | BoundLocalSymbol; type: SemanticScalarType | SemanticPointerType }
  | { kind: "localAddress"; symbol: BoundLocalSymbol; type: SemanticPointerType }
  | { kind: "aggregateFieldAccess"; symbol: BoundLocalSymbol | BoundParamSymbol; offset: number; type: SemanticScalarType }
  | { kind: "aggregateValueFieldAccess"; source: BoundAggregateValueExpr; offset: number; type: SemanticScalarType }
  | { kind: "pointerAdd"; pointer: BoundExpr; index: BoundExpr; pointee: ScalarType; type: SemanticPointerType }
  | { kind: "localArrayElement"; symbol: BoundLocalSymbol; index: BoundExpr; type: SemanticScalarType }
  | { kind: "paramArrayElement"; symbol: BoundParamSymbol; index: BoundExpr; type: SemanticScalarType }
  | { kind: "deref"; pointer: BoundExpr; type: SemanticScalarType }
  | { kind: "derefAssign"; pointer: BoundExpr; expr: BoundExpr; type: SemanticScalarType }
  | { kind: "call"; target: BoundFunctionSymbol | { kind: "extern"; name: string }; args: BoundCallArg[]; type: SemanticScalarType | SemanticPointerType }
  | { kind: "preIncDec"; local: BoundLocalSymbol; op: "++" | "--"; type: SemanticScalarType | SemanticPointerType }
  | { kind: "postIncDec"; local: BoundLocalSymbol; op: "++" | "--"; type: SemanticScalarType | SemanticPointerType }
  | { kind: "preArrayIncDec"; target: BoundLocalSymbol | BoundParamSymbol; index: BoundExpr; op: "++" | "--"; type: SemanticScalarType }
  | { kind: "postArrayIncDec"; target: BoundLocalSymbol | BoundParamSymbol; index: BoundExpr; op: "++" | "--"; type: SemanticScalarType }
  | { kind: "derefIncDec"; pointer: BoundExpr; op: "++" | "--"; mode: "prefix" | "postfix"; type: SemanticScalarType }
  | { kind: "assign"; local: BoundLocalSymbol; expr: BoundExpr; type: SemanticScalarType | SemanticPointerType }
  | { kind: "arrayAssignExpr"; target: BoundLocalSymbol | BoundParamSymbol; index: BoundExpr; expr: BoundExpr; type: SemanticScalarType }
  | { kind: "comma"; left: BoundExpr; right: BoundExpr; type: SemanticScalarType | SemanticPointerType }
  | { kind: "conditional"; condition: BoundExpr; thenExpr: BoundExpr; elseExpr: BoundExpr; type: SemanticScalarType | SemanticPointerType }
  | { kind: "compare"; left: BoundExpr; right: BoundExpr; op: CompareOp; type: SemanticScalarType }
  | { kind: "logical"; left: BoundExpr; right: BoundExpr; op: LogicalOp; type: SemanticScalarType }
  | { kind: "bitwise"; left: BoundExpr; right: BoundExpr; op: BitwiseOp; type: SemanticScalarType }
  | { kind: "shift"; left: BoundExpr; right: BoundExpr; op: ShiftOp; type: SemanticScalarType }
  | { kind: "multiplicative"; left: BoundExpr; right: BoundExpr; op: MultiplicativeOp; type: SemanticScalarType }
  | { kind: "additive"; left: BoundExpr; right: BoundExpr; op: AdditiveOp; type: SemanticScalarType };

type Scope = {
  parent?: Scope;
  entries: Map<string, BoundSymbol>;
};

type AggregateLayout = {
  kind: "aggregateLayout";
  aggregateKind: AggregateKind;
  name: string;
  size: number;
  fields: Map<string, { offset: number; type: ScalarType }>;
};

const MAX_CONTROL_NESTING = 8;
let currentAggregateLayouts = new Map<string, AggregateLayout>();

export function analyzeProgram(program: SourceProgram, sourceText: string, file?: string): BoundProgram {
  currentAggregateLayouts = buildAggregateLayouts(program.aggregates, sourceText, file);
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
      returnType: toSemanticType(fn.returnType),
      params: fn.params.map((param) => toSemanticType(param.type)),
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
      type: toSemanticType(param.type),
      slot: index,
    };
    functionScope.entries.set(param.name, symbol);
    params.push(symbol);
  }

  const allLocals = new Map<string, BoundLocalSymbol>();
  const localList: BoundLocalSymbol[] = [];
  const body = analyzeBlock(fn.body, functionScope, allLocals, localList, functionSymbols, fn.name, sourceText, file, 0);
  return {
    kind: "boundFunction",
    name: fn.name,
    returnType: toSemanticType(fn.returnType),
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
  loopDepth = 0,
  breakDepth = 0,
  controlNesting = 0,
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
      type: toSemanticType(declaration.type),
      storageBytes: getTypeStorageBytes(declaration.type),
      slot: localList.length,
    };
    scope.entries.set(declaration.name, symbol);
    allLocals.set(declaration.name, symbol);
    localList.push(symbol);
  }

  return {
    kind: "boundBlock",
    statements: block.statements.map((stmt) => analyzeStmt(stmt, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth, controlNesting)),
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
  loopDepth = 0,
  breakDepth = 0,
  controlNesting = 0,
): BoundStmt {
  switch (stmt.kind) {
    case "return":
      {
        const fnSymbol = functionSymbols.get(functionName);
        if (!fnSymbol) {
          throw new Error(`Unknown function symbol '${functionName}'.`);
        }
        return {
          kind: "return",
          expr: fnSymbol.returnType.kind === "aggregate"
            ? analyzeAggregateValueExpr(stmt.expr, scope, functionSymbols, fnSymbol.returnType, functionName, sourceText, file)
            : analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
        };
      }
    case "expr":
      return { kind: "expr", expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file) };
    case "if":
      assertControlNesting(controlNesting + 1, functionName, sourceText, file);
      return {
        kind: "if",
        condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
        thenBlock: analyzeBlock(stmt.thenBlock, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth, controlNesting + 1),
        elseBlock: stmt.elseBlock
          ? analyzeBlock(stmt.elseBlock, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth, controlNesting + 1)
          : undefined,
      };
    case "while":
      assertControlNesting(controlNesting + 1, functionName, sourceText, file);
      return {
        kind: "while",
        condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
        body: analyzeBlock(stmt.body, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth + 1, breakDepth + 1, controlNesting + 1),
      };
    case "doWhile":
      assertControlNesting(controlNesting + 1, functionName, sourceText, file);
      return {
        kind: "doWhile",
        body: analyzeBlock(stmt.body, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth + 1, breakDepth + 1, controlNesting + 1),
        condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
      };
    case "for":
      {
        assertControlNesting(controlNesting + 1, functionName, sourceText, file);
        const forScope: Scope = { parent: scope, entries: new Map() };
        let initializer: BoundForInit | undefined;
        if (stmt.initializer) {
          initializer = analyzeForInitializer(stmt.initializer, forScope, allLocals, localList, functionSymbols, functionName, sourceText, file);
        }
      return {
        kind: "for",
        initializer,
        condition: stmt.condition
          ? analyzeExpr(stmt.condition, forScope, functionSymbols, functionName, sourceText, file)
          : undefined,
        step: stmt.step
          ? analyzeSimpleStmt(stmt.step, forScope, functionSymbols, functionName, sourceText, file)
          : undefined,
        body: analyzeBlock(stmt.body, forScope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth + 1, breakDepth + 1, controlNesting + 1),
      };
      }
    case "switch":
      assertUniqueSwitchCaseValues(stmt.cases, functionName, sourceText, file);
      assertControlNesting(controlNesting + 1, functionName, sourceText, file);
      return {
        kind: "switch",
        expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
        cases: stmt.cases.map((entry) => ({
          kind: "boundSwitchCase",
          value: entry.value,
          body: analyzeBlock(entry.body, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth + 1, controlNesting + 1),
        })),
        defaultCase: stmt.defaultCase
          ? analyzeBlock(stmt.defaultCase, scope, allLocals, localList, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth + 1, controlNesting + 1)
          : undefined,
      };
    case "assign": {
      const symbol = lookupVisible(scope, stmt.name);
      if (!symbol || symbol.kind !== "local" || symbol.type.kind === "array") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local symbols, got '${stmt.name}'.`, {
          file,
          offset: 0,
        });
      }
      if (symbol.type.kind === "aggregate") {
        return analyzeAggregateAssignStmt(symbol as BoundLocalSymbol & { type: SemanticAggregateType }, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
      }
      return {
        kind: "assign",
        local: symbol,
        expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
      };
    }
    case "arrayAssign":
      return analyzeIndexedAssignStmt(stmt.name, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
    case "memberAssign":
      return {
        kind: "expr",
        expr: analyzeAggregateFieldAssignExpr(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
      };
    case "memberExprAssign":
      return {
        kind: "expr",
        expr: analyzeAggregateFieldAssignExprTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
      };
    case "pointerMemberAssign":
      return {
        kind: "expr",
        expr: analyzePointerAggregateFieldAssignExpr(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
      };
    case "pointerMemberExprAssign":
      return {
        kind: "expr",
        expr: analyzePointerAggregateFieldAssignExprTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
      };
    case "break":
      if (breakDepth === 0) {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports 'break' inside loops or switches in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      return { kind: "break" };
    case "continue":
      if (loopDepth === 0) {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports 'continue' inside loops in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      return { kind: "continue" };
    default:
      return assertNever(stmt);
  }
}

function analyzeSimpleStmt(
  stmt: SourceSimpleStmt,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundSimpleStmt {
  if (stmt.kind === "expr") {
    return { kind: "expr", expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file) };
  }
  if (stmt.kind === "arrayAssign") {
    return analyzeIndexedAssignSimpleStmt(stmt.name, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
  }
  if (stmt.kind === "memberAssign") {
    return {
      kind: "expr",
      expr: analyzeAggregateFieldAssignExpr(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
    };
  }
  if (stmt.kind === "memberExprAssign") {
    return {
      kind: "expr",
      expr: analyzeAggregateFieldAssignExprTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
    };
  }
  if (stmt.kind === "pointerMemberAssign") {
    return {
      kind: "expr",
      expr: analyzePointerAggregateFieldAssignExpr(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
    };
  }
  if (stmt.kind === "pointerMemberExprAssign") {
    return {
      kind: "expr",
      expr: analyzePointerAggregateFieldAssignExprTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
    };
  }
  const symbol = lookupVisible(scope, stmt.name);
  if (!symbol || symbol.kind !== "local" || symbol.type.kind === "array") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local symbols, got '${stmt.name}'.`, {
      file,
      offset: 0,
    });
  }
  if (symbol.type.kind === "aggregate") {
    return analyzeAggregateAssignSimpleStmt(symbol as BoundLocalSymbol & { type: SemanticAggregateType }, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
  }
  return {
    kind: "assign",
    local: symbol,
    expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
  };
}

function analyzeAggregateAssignStmt(
  target: BoundLocalSymbol & { type: SemanticAggregateType },
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundStmt, { kind: "aggregateAssign" }> {
  const source = analyzeAggregateValueExpr(expr, scope, functionSymbols, target.type, functionName, sourceText, file);
  return {
    kind: "aggregateAssign",
    target,
    source,
  };
}

function analyzeAggregateAssignSimpleStmt(
  target: BoundLocalSymbol & { type: SemanticAggregateType },
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundSimpleStmt, { kind: "aggregateAssign" }> {
  const source = analyzeAggregateValueExpr(expr, scope, functionSymbols, target.type, functionName, sourceText, file);
  return {
    kind: "aggregateAssign",
    target,
    source,
  };
}

function analyzeAggregateValueExpr(
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  targetType: SemanticAggregateType | undefined,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundAggregateValueExpr {
  switch (expr.kind) {
    case "ref": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || symbol.type.kind !== "aggregate") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value expressions from local/parameter aggregate symbols in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      const aggregateSymbol = symbol as (BoundLocalSymbol | BoundParamSymbol) & { type: SemanticAggregateType };
      if (targetType) {
        assertMatchingAggregateType(aggregateSymbol.type, targetType, functionName, sourceText, file);
      }
      return {
        kind: "aggregateRef",
        symbol: aggregateSymbol,
        type: aggregateSymbol.type,
      };
    }
    case "comma":
      {
      const right = analyzeAggregateValueExpr(expr.right, scope, functionSymbols, targetType, functionName, sourceText, file);
      return {
        kind: "comma",
        left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
        right,
        type: right.type,
      };
      }
    case "conditional": {
      const thenExpr = analyzeAggregateValueExpr(expr.thenExpr, scope, functionSymbols, targetType, functionName, sourceText, file);
      const elseExpr = analyzeAggregateValueExpr(expr.elseExpr, scope, functionSymbols, thenExpr.type, functionName, sourceText, file);
      assertMatchingAggregateType(thenExpr.type, elseExpr.type, functionName, sourceText, file);
      return {
        kind: "conditional",
        condition: analyzeExpr(expr.condition, scope, functionSymbols, functionName, sourceText, file),
        thenExpr,
        elseExpr,
        type: thenExpr.type,
      };
    }
    case "call": {
      const target = functionSymbols.get(expr.target);
      if (!target || target.returnType.kind !== "aggregate") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value calls to defined aggregate-returning functions in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      if (target.params.length !== expr.args.length) {
        throwDiagnostic(
          sourceText,
          `TsSccCompilerAdapter Phase C subset expected ${target.params.length} argument(s) for ${expr.target}(), got ${expr.args.length}.`,
          { file, offset: 0 },
        );
      }
      if (targetType) {
        assertMatchingAggregateType(target.returnType, targetType, functionName, sourceText, file);
      }
      return {
        kind: "call",
        target,
        args: expr.args.map((arg, index) => {
          const paramType = target.params[index];
          return paramType.kind === "aggregate"
            ? analyzeAggregateValueExpr(arg, scope, functionSymbols, paramType, functionName, sourceText, file)
            : analyzeExpr(arg, scope, functionSymbols, functionName, sourceText, file);
        }),
        type: target.returnType,
      };
    }
    default:
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value expressions from local/parameter aggregate symbols in ${functionName}().`, {
        file,
        offset: 0,
      });
  }
}

function assertMatchingAggregateType(
  sourceType: SemanticAggregateType,
  targetType: SemanticAggregateType,
  functionName: string,
  sourceText: string,
  file?: string,
): void {
  if (
    sourceType.aggregateKind !== targetType.aggregateKind
    || sourceType.name !== targetType.name
    || sourceType.size !== targetType.size
  ) {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate assignment between matching ${targetType.aggregateKind} types in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
}

function analyzeArrayAssignStmt(
  name: string,
  index: SourceExpr,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundStmt, { kind: "arrayAssign" }> {
  const symbol = lookupVisible(scope, name);
  if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || symbol.type.kind !== "array") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local/parameter char arrays, got '${name}[...]'.`, {
      file,
      offset: 0,
    });
  }
  const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
  if (symbol.kind === "local") {
    assertArrayIndexInBounds(boundIndex, name, getSizedArrayLength(symbol.type), functionName, sourceText, file);
  }
  return {
    kind: "arrayAssign",
    target: symbol,
    index: boundIndex,
    expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
  };
}

function analyzeIndexedAssignStmt(
  name: string,
  index: SourceExpr,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundStmt {
  const symbol = lookupVisible(scope, name);
  if (symbol && (symbol.kind === "local" || symbol.kind === "param") && symbol.type.kind === "pointer") {
    return {
      kind: "expr",
      expr: analyzePointerIndexedAssignExpr(symbol, index, expr, scope, functionSymbols, functionName, sourceText, file),
    };
  }
  return analyzeArrayAssignStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file);
}

function analyzeIndexedAssignSimpleStmt(
  name: string,
  index: SourceExpr,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundSimpleStmt {
  const symbol = lookupVisible(scope, name);
  if (symbol && (symbol.kind === "local" || symbol.kind === "param") && symbol.type.kind === "pointer") {
    return {
      kind: "expr",
      expr: analyzePointerIndexedAssignExpr(symbol, index, expr, scope, functionSymbols, functionName, sourceText, file),
    };
  }
  return analyzeArrayAssignStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file);
}

function analyzePointerIndexedAssignExpr(
  symbol: BoundLocalSymbol | BoundParamSymbol,
  index: SourceExpr,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundExpr, { kind: "derefAssign" }> {
  if (symbol.type.kind !== "pointer") {
    throw new Error("Internal semantic error: expected pointer symbol.");
  }
  const pointee = getScalarPointerPointee(symbol.type, functionName, sourceText, file);
  return {
    kind: "derefAssign",
    pointer: {
      kind: "pointerAdd",
      pointer: { kind: "ref", symbol, type: symbol.type },
      index: analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file),
      pointee,
      type: symbol.type,
    },
    expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
    type: toSemanticScalarType(pointee),
  };
}

function analyzeAggregateFieldAssignExpr(
  name: string,
  fieldName: string,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundExpr, { kind: "derefAssign" }> {
  const symbol = lookupVisible(scope, name);
  if (!symbol || symbol.kind !== "local" || symbol.type.kind !== "aggregate") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports member assignment on local struct/union objects, got '${name}.${fieldName}'.`, {
      file,
      offset: 0,
    });
  }
  const field = getAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file);
  return {
    kind: "derefAssign",
    pointer: {
      kind: "pointerAdd",
      pointer: {
        kind: "localAddress",
        symbol,
        type: toSemanticPointerType({
          kind: "aggregate",
          aggregateKind: symbol.type.aggregateKind,
          name: symbol.type.name,
        }),
      },
      index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
      pointee: "char",
      type: toSemanticPointerType("char"),
    },
    expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
    type: toSemanticScalarType(field.type),
  };
}

function analyzePointerAggregateFieldAssignExpr(
  name: string,
  fieldName: string,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundExpr, { kind: "derefAssign" }> {
  const { symbol, field } = getPointerAggregateFieldTarget(name, fieldName, scope, functionName, sourceText, file);
  return {
    kind: "derefAssign",
    pointer: {
      kind: "pointerAdd",
      pointer: { kind: "ref", symbol, type: symbol.type },
      index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
      pointee: "char",
      type: toSemanticPointerType("char"),
    },
    expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
    type: toSemanticScalarType(field.type),
  };
}

function analyzeAggregateFieldAssignExprTarget(
  targetExpr: SourceExpr,
  fieldName: string,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundExpr, { kind: "derefAssign" }> {
  const target = getAggregateFieldPointerFromTargetExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file);
  return {
    kind: "derefAssign",
    pointer: target.pointer,
    expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
    type: target.type,
  };
}

function analyzePointerAggregateFieldAssignExprTarget(
  targetExpr: SourceExpr,
  fieldName: string,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundExpr, { kind: "derefAssign" }> {
  const pointer = analyzeExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
  const { field } = getPointerAggregateFieldFromExpr(pointer, fieldName, functionName, sourceText, file);
  return {
    kind: "derefAssign",
    pointer: {
      kind: "pointerAdd",
      pointer,
      index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
      pointee: "char",
      type: toSemanticPointerType("char"),
    },
    expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
    type: toSemanticScalarType(field.type),
  };
}

function analyzeAggregateFieldPointer(
  name: string,
  fieldName: string,
  scope: Scope,
  functionName: string,
  sourceText: string,
  file?: string,
): { pointer: BoundExpr; type: SemanticScalarType } {
  const symbol = lookupVisible(scope, name);
  if (!symbol || symbol.kind !== "local" || symbol.type.kind !== "aggregate") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate field access on local struct/union objects, got '${name}.${fieldName}'.`, {
      file,
      offset: 0,
    });
  }
  const field = getAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file);
  return {
    pointer: {
      kind: "pointerAdd",
      pointer: {
        kind: "localAddress",
        symbol,
        type: toSemanticPointerType({
          kind: "aggregate",
          aggregateKind: symbol.type.aggregateKind,
          name: symbol.type.name,
        }),
      },
      index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
      pointee: "char",
      type: toSemanticPointerType("char"),
    },
    type: toSemanticScalarType(field.type),
  };
}

function analyzePointerAggregateFieldPointer(
  name: string,
  fieldName: string,
  scope: Scope,
  functionName: string,
  sourceText: string,
  file?: string,
): { pointer: BoundExpr; type: SemanticScalarType } {
  const { symbol, field } = getPointerAggregateFieldTarget(name, fieldName, scope, functionName, sourceText, file);
  return {
    pointer: {
      kind: "pointerAdd",
      pointer: { kind: "ref", symbol, type: symbol.type },
      index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
      pointee: "char",
      type: toSemanticPointerType("char"),
    },
    type: toSemanticScalarType(field.type),
  };
}

function getAggregateFieldPointerFromTargetExpr(
  targetExpr: SourceExpr,
  fieldName: string,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): { pointer: BoundExpr; type: SemanticScalarType } {
  if (targetExpr.kind === "ref") {
    return analyzeAggregateFieldPointer(targetExpr.name, fieldName, scope, functionName, sourceText, file);
  }
  if (targetExpr.kind === "deref") {
    const pointer = analyzeExpr(targetExpr.expr, scope, functionSymbols, functionName, sourceText, file);
    if (pointer.type.kind !== "pointer" || typeof pointer.type.pointee === "string") {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '.' on dereferenced struct/union pointers in ${functionName}().`, {
        file,
        offset: 0,
      });
    }
    const { field } = getPointerAggregateFieldFromExpr(pointer, fieldName, functionName, sourceText, file);
    return {
      pointer: {
        kind: "pointerAdd",
        pointer,
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: "char",
        type: toSemanticPointerType("char"),
      },
      type: toSemanticScalarType(field.type),
    };
  }
  throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '.' on local aggregates or dereferenced struct/union pointers in ${functionName}().`, {
    file,
    offset: 0,
  });
}

function getAggregateFieldReadFromTargetExpr(
  targetExpr: SourceExpr,
  fieldName: string,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): { kind: "pointer"; pointer: BoundExpr; type: SemanticScalarType } | { kind: "value"; expr: BoundExpr } {
  if (targetExpr.kind === "ref" || targetExpr.kind === "deref") {
    const target = getAggregateFieldPointerFromTargetExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file);
    return {
      kind: "pointer",
      pointer: target.pointer,
      type: target.type,
    };
  }
  return {
    kind: "value",
    expr: analyzeAggregateValueFieldReadExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file),
  };
}

function analyzeAggregateValueFieldReadExpr(
  targetExpr: SourceExpr,
  fieldName: string,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundExpr {
  const aggregateValue = analyzeAggregateValueExpr(targetExpr, scope, functionSymbols, undefined, functionName, sourceText, file);
  return lowerAggregateValueFieldReadExpr(aggregateValue, fieldName, functionName, sourceText, file);
}

function lowerAggregateValueFieldReadExpr(
  expr: BoundAggregateValueExpr,
  fieldName: string,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundExpr {
  const field = getAggregateFieldLayout(expr.type, fieldName, functionName, sourceText, file);
  return {
    kind: "aggregateValueFieldAccess",
    source: expr,
    offset: field.offset,
    type: toSemanticScalarType(field.type),
  };
}

function analyzeForInitializer(
  init: SourceForInit,
  scope: Scope,
  allLocals: Map<string, BoundLocalSymbol>,
  localList: BoundLocalSymbol[],
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundForInit {
  if (init.kind !== "localDecl") {
    return analyzeSimpleStmt(init, scope, functionSymbols, functionName, sourceText, file);
  }
  if (lookupVisible(scope, init.name) || allLocals.has(init.name)) {
    const existing = lookupVisible(scope, init.name) ?? allLocals.get(init.name);
    if (existing?.kind === "param") {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support local '${init.name}' shadowing a parameter in ${functionName}().`, {
        file,
        offset: 0,
      });
    }
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate local '${init.name}' in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  const symbol: BoundLocalSymbol = {
    kind: "local",
    name: init.name,
    type: toSemanticType(init.type),
    storageBytes: getTypeStorageBytes(init.type),
    slot: localList.length,
  };
  scope.entries.set(init.name, symbol);
  allLocals.set(init.name, symbol);
  localList.push(symbol);
  return {
    kind: "localDecl",
    local: symbol,
    initializer: init.initializer
      ? analyzeExpr(init.initializer, scope, functionSymbols, functionName, sourceText, file)
      : undefined,
  };
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
      return { kind: "const", value: expr.value, type: toSemanticScalarType("int") };
    case "string":
      return { kind: "string", value: expr.value, type: toSemanticScalarType("int") };
    case "addressOf": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || symbol.kind !== "local") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports address-of on local symbols, got '${expr.name}'.`, {
          file,
          offset: 0,
        });
      }
      if (symbol.type.kind === "pointer") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support pointer-to-pointer address-of for '${expr.name}' in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      if (symbol.type.kind === "array") {
        return { kind: "localAddress", symbol, type: toSemanticPointerType("char") };
      }
      if (symbol.type.kind === "aggregate") {
        return {
          kind: "localAddress",
          symbol,
          type: toSemanticPointerType({
            kind: "aggregate",
            aggregateKind: symbol.type.aggregateKind,
            name: symbol.type.name,
          }),
        };
      }
      return { kind: "localAddress", symbol, type: toSemanticPointerType(symbol.type.name) };
    }
    case "addressOfExpr": {
      const target = analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file);
      if (target.kind === "localArrayElement") {
        return {
          kind: "pointerAdd",
          pointer: { kind: "localAddress", symbol: target.symbol, type: toSemanticPointerType("char") },
          index: target.index,
          pointee: "char",
          type: toSemanticPointerType("char"),
        };
      }
      if (target.kind === "paramArrayElement") {
        return {
          kind: "pointerAdd",
          pointer: { kind: "ref", symbol: target.symbol, type: toSemanticPointerType("char") },
          index: target.index,
          pointee: "char",
          type: toSemanticPointerType("char"),
        };
      }
      if (target.kind === "aggregateFieldAccess") {
        const aggregateType = target.symbol.type as SemanticAggregateType;
        return {
          kind: "pointerAdd",
          pointer: target.symbol.kind === "local"
            ? {
              kind: "localAddress",
              symbol: target.symbol,
              type: toSemanticPointerType({
                kind: "aggregate",
                aggregateKind: aggregateType.aggregateKind,
                name: aggregateType.name,
              }),
            }
            : {
              kind: "ref",
              symbol: target.symbol,
              type: toSemanticPointerType({
                kind: "aggregate",
                aggregateKind: aggregateType.aggregateKind,
                name: aggregateType.name,
              }),
            },
          index: { kind: "const", value: target.offset, type: toSemanticScalarType("int") },
          pointee: "char",
          type: toSemanticPointerType(target.type.name),
        };
      }
      if (target.kind === "deref") {
        if (target.pointer.type.kind === "pointer") {
          return target.pointer;
        }
      }
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports address-of on locals, array elements, or dereference in ${functionName}().`, {
        file,
        offset: 0,
      });
    }
    case "ref": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param")) {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not know symbol '${expr.name}'.`, {
          file,
          offset: 0,
        });
      }
      if (symbol.kind === "local" && symbol.type.kind === "array") {
        return { kind: "localAddress", symbol, type: toSemanticPointerType("char") };
      }
      if (symbol.kind === "param" && symbol.type.kind === "array") {
        return { kind: "ref", symbol, type: toSemanticPointerType("char") };
      }
      if (symbol.type.kind === "aggregate") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not yet support aggregate object values for '${expr.name}' in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      return { kind: "ref", symbol, type: getValueSemanticType(symbol.type) };
    }
    case "memberAccess": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || symbol.type.kind !== "aggregate") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports member access on local/parameter struct/union objects, got '${expr.name}.${expr.field}'.`, {
          file,
          offset: 0,
        });
      }
      const field = getAggregateFieldLayout(symbol.type, expr.field, functionName, sourceText, file);
      return {
        kind: "aggregateFieldAccess",
        symbol,
        offset: field.offset,
        type: toSemanticScalarType(field.type),
      };
    }
    case "memberExprAccess": {
      const target = getAggregateFieldReadFromTargetExpr(expr.target, expr.field, scope, functionSymbols, functionName, sourceText, file);
      if (target.kind === "value") {
        return target.expr;
      }
      return {
        kind: "deref",
        pointer: target.pointer,
        type: target.type,
      };
    }
    case "pointerMemberAccess": {
      const { symbol, field } = getPointerAggregateFieldTarget(expr.name, expr.field, scope, functionName, sourceText, file);
      return {
        kind: "deref",
        pointer: {
          kind: "pointerAdd",
          pointer: { kind: "ref", symbol, type: symbol.type },
          index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
          pointee: "char",
          type: toSemanticPointerType("char"),
        },
        type: toSemanticScalarType(field.type),
      };
    }
    case "pointerMemberExprAccess": {
      const pointer = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
      const { field } = getPointerAggregateFieldFromExpr(pointer, expr.field, functionName, sourceText, file);
      return {
        kind: "deref",
        pointer: {
          kind: "pointerAdd",
          pointer,
          index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
          pointee: "char",
          type: toSemanticPointerType("char"),
        },
        type: toSemanticScalarType(field.type),
      };
    }
    case "deref": {
      const pointer = analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file);
      if (pointer.type.kind !== "pointer") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports dereference on pointer values in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      const pointee = getScalarPointerPointee(pointer.type, functionName, sourceText, file);
      return {
        kind: "deref",
        pointer,
        type: toSemanticScalarType(pointee),
      };
    }
    case "arrayIndex": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param")) {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not know symbol '${expr.name}'.`, {
          file,
          offset: 0,
        });
      }
      if (symbol.type.kind === "pointer") {
        const pointee = getScalarPointerPointee(symbol.type, functionName, sourceText, file);
        return {
          kind: "deref",
          pointer: {
            kind: "pointerAdd",
            pointer: { kind: "ref", symbol, type: symbol.type },
            index: analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file),
            pointee,
            type: symbol.type,
          },
          type: toSemanticScalarType(pointee),
        };
      }
      if (symbol.type.kind !== "array") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports indexing on local/parameter char arrays or pointers, got '${expr.name}[...]'.`, {
          file,
          offset: 0,
        });
      }
      const index = analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file);
      if (symbol.kind === "param") {
        return {
          kind: "paramArrayElement",
          symbol,
          index,
          type: toSemanticScalarType("char"),
        };
      }
      assertArrayIndexInBounds(index, expr.name, getSizedArrayLength(symbol.type), functionName, sourceText, file);
      return {
        kind: "localArrayElement",
        symbol,
        index,
        type: toSemanticScalarType("char"),
      };
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
      if (target?.returnType.kind === "aggregate") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not yet support aggregate-returning calls in scalar expression position in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      return {
        kind: "call",
        target: target ?? { kind: "extern", name: expr.target },
        args: expr.args.map((arg, index) => {
          const paramType = target?.params[index];
          if (paramType?.kind === "aggregate") {
            return analyzeAggregateValueExpr(arg, scope, functionSymbols, paramType, functionName, sourceText, file);
          }
          return analyzeExpr(arg, scope, functionSymbols, functionName, sourceText, file);
        }),
        type: (target?.returnType as SemanticScalarType | SemanticPointerType | undefined) ?? toSemanticScalarType("int"),
      };
    }
    case "preIncDec":
    case "postIncDec": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || symbol.kind !== "local" || symbol.type.kind === "array") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports increment/decrement on local scalar/pointer symbols, got '${expr.name}'.`, {
          file,
          offset: 0,
        });
      }
      return {
        kind: expr.kind,
        local: symbol,
        op: expr.op,
        type: getValueSemanticType(symbol.type),
      };
    }
    case "preArrayIncDec":
    case "postArrayIncDec": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || (symbol.type.kind !== "array" && symbol.type.kind !== "pointer")) {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports increment/decrement on local/parameter char arrays or scalar pointers, got '${expr.name}[...]'.`, {
          file,
          offset: 0,
        });
      }
      const boundIndex = analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file);
      if (symbol.type.kind === "pointer") {
        const pointee = getScalarPointerPointee(symbol.type, functionName, sourceText, file);
        return {
          kind: "derefIncDec",
          pointer: {
            kind: "pointerAdd",
            pointer: { kind: "ref", symbol, type: symbol.type },
            index: boundIndex,
            pointee,
            type: symbol.type,
          },
          op: expr.op,
          mode: expr.kind === "preArrayIncDec" ? "prefix" : "postfix",
          type: toSemanticScalarType(pointee),
        };
      }
      if (symbol.kind === "local") {
        assertArrayIndexInBounds(boundIndex, expr.name, getSizedArrayLength(symbol.type), functionName, sourceText, file);
      }
      return {
        kind: expr.kind,
        target: symbol,
        index: boundIndex,
        op: expr.op,
        type: toSemanticScalarType("char"),
      };
    }
    case "preDerefIncDec":
    case "postDerefIncDec": {
      const target = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
      const pointer = target.kind === "deref" ? target.pointer : target;
      if (pointer.type.kind !== "pointer") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports increment/decrement on dereferenced scalar pointers in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      const pointee = getScalarPointerPointee(pointer.type, functionName, sourceText, file);
      return {
        kind: "derefIncDec",
        pointer,
        op: expr.op,
        mode: expr.kind === "preDerefIncDec" ? "prefix" : "postfix",
        type: toSemanticScalarType(pointee),
      };
    }
    case "preMemberIncDec":
    case "postMemberIncDec": {
      const target = analyzeAggregateFieldPointer(expr.name, expr.field, scope, functionName, sourceText, file);
      return {
        kind: "derefIncDec",
        pointer: target.pointer,
        op: expr.op,
        mode: expr.kind === "preMemberIncDec" ? "prefix" : "postfix",
        type: target.type,
      };
    }
    case "preMemberExprIncDec":
    case "postMemberExprIncDec": {
      const target = getAggregateFieldPointerFromTargetExpr(expr.target, expr.field, scope, functionSymbols, functionName, sourceText, file);
      return {
        kind: "derefIncDec",
        pointer: target.pointer,
        op: expr.op,
        mode: expr.kind === "preMemberExprIncDec" ? "prefix" : "postfix",
        type: target.type,
      };
    }
    case "prePointerMemberIncDec":
    case "postPointerMemberIncDec": {
      const target = analyzePointerAggregateFieldPointer(expr.name, expr.field, scope, functionName, sourceText, file);
      return {
        kind: "derefIncDec",
        pointer: target.pointer,
        op: expr.op,
        mode: expr.kind === "prePointerMemberIncDec" ? "prefix" : "postfix",
        type: target.type,
      };
    }
    case "prePointerMemberExprIncDec":
    case "postPointerMemberExprIncDec": {
      const pointer = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
      const { field } = getPointerAggregateFieldFromExpr(pointer, expr.field, functionName, sourceText, file);
      return {
        kind: "derefIncDec",
        pointer: {
          kind: "pointerAdd",
          pointer,
          index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
          pointee: "char",
          type: toSemanticPointerType("char"),
        },
        op: expr.op,
        mode: expr.kind === "prePointerMemberExprIncDec" ? "prefix" : "postfix",
        type: toSemanticScalarType(field.type),
      };
    }
    case "assign": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || symbol.kind !== "local" || symbol.type.kind === "array") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local symbols, got '${expr.name}'.`, {
          file,
          offset: 0,
        });
      }
      return {
        kind: "assign",
        local: symbol,
        expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
        type: getValueSemanticType(symbol.type),
      };
    }
    case "arrayAssign": {
      const symbol = lookupVisible(scope, expr.name);
      if (symbol && (symbol.kind === "local" || symbol.kind === "param") && symbol.type.kind === "pointer") {
        return analyzePointerIndexedAssignExpr(symbol, expr.index, expr.expr, scope, functionSymbols, functionName, sourceText, file);
      }
      const stmt = analyzeArrayAssignStmt(expr.name, expr.index, expr.expr, scope, functionSymbols, functionName, sourceText, file);
      return {
        kind: "arrayAssignExpr",
        target: stmt.target,
        index: stmt.index,
        expr: stmt.expr,
        type: toSemanticScalarType("char"),
      };
    }
    case "memberAssign":
      return analyzeAggregateFieldAssignExpr(expr.name, expr.field, expr.expr, scope, functionSymbols, functionName, sourceText, file);
    case "memberExprAssign":
      return analyzeAggregateFieldAssignExprTarget(expr.target, expr.field, expr.expr, scope, functionSymbols, functionName, sourceText, file);
    case "pointerMemberAssign":
      return analyzePointerAggregateFieldAssignExpr(expr.name, expr.field, expr.expr, scope, functionSymbols, functionName, sourceText, file);
    case "pointerMemberExprAssign":
      return analyzePointerAggregateFieldAssignExprTarget(expr.target, expr.field, expr.expr, scope, functionSymbols, functionName, sourceText, file);
    case "derefAssign": {
      const target = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
      const pointer = target.kind === "deref" ? target.pointer : target;
      if (pointer.type.kind !== "pointer") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports pointer assignment through dereference in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      const pointee = getScalarPointerPointee(pointer.type, functionName, sourceText, file);
      return {
        kind: "derefAssign",
        pointer,
        expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
        type: toSemanticScalarType(pointee),
      };
    }
    case "sizeofType":
      return {
        kind: "const",
        value: getTypeStorageBytes(expr.type),
        type: toSemanticScalarType("int"),
      };
    case "sizeofExpr": {
      return {
        kind: "const",
        value: getSourceExprStorageBytes(expr.expr, scope, functionSymbols, functionName, sourceText, file),
        type: toSemanticScalarType("int"),
      };
    }
    case "comma": {
      const left = analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file);
      const right = analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file);
      return {
        kind: "comma",
        left,
        right,
        type: right.type,
      };
    }
    case "conditional": {
      const condition = analyzeExpr(expr.condition, scope, functionSymbols, functionName, sourceText, file);
      const thenExpr = analyzeExpr(expr.thenExpr, scope, functionSymbols, functionName, sourceText, file);
      const elseExpr = analyzeExpr(expr.elseExpr, scope, functionSymbols, functionName, sourceText, file);
      return {
        kind: "conditional",
        condition,
        thenExpr,
        elseExpr,
        type: getConditionalResultType(thenExpr, elseExpr, functionName, sourceText, file),
      };
    }
    case "binary":
      if (isLogicalOp(expr.op)) {
        return {
          kind: "logical",
          left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
          right: analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file),
          op: expr.op,
          type: toSemanticScalarType("int"),
        };
      }
      if (isBitwiseOp(expr.op)) {
        return {
          kind: "bitwise",
          left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
          right: analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file),
          op: expr.op,
          type: toSemanticScalarType("int"),
        };
      }
      if (isShiftOp(expr.op)) {
        return {
          kind: "shift",
          left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
          right: analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file),
          op: expr.op,
          type: toSemanticScalarType("int"),
        };
      }
      if (isCompareOp(expr.op)) {
        return {
          kind: "compare",
          left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
          right: analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file),
          op: expr.op,
          type: toSemanticScalarType("int"),
        };
      }
      if (isMultiplicativeOp(expr.op)) {
        return {
          kind: "multiplicative",
          left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
          right: analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file),
          op: expr.op,
          type: toSemanticScalarType("int"),
        };
      }
      {
        const left = analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file);
        const right = analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file);
        if (left.type.kind === "pointer" && right.type.kind === "scalar") {
          const pointee = getScalarPointerPointee(left.type, functionName, sourceText, file);
          return {
            kind: "pointerAdd",
            pointer: left,
            index: expr.op === "+"
              ? right
              : {
                kind: "additive",
                left: { kind: "const", value: 0, type: toSemanticScalarType("int") },
                right,
                op: "-",
                type: toSemanticScalarType("int"),
              },
            pointee,
            type: left.type,
          };
        }
        if (left.type.kind === "scalar" && right.type.kind === "pointer" && expr.op === "+") {
          const pointee = getScalarPointerPointee(right.type, functionName, sourceText, file);
          return {
            kind: "pointerAdd",
            pointer: right,
            index: left,
            pointee,
            type: right.type,
          };
        }
        return {
          kind: "additive",
          left,
          right,
          op: expr.op,
          type: toSemanticScalarType("int"),
        };
      }
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

function isCompareOp(op: LogicalOp | BitwiseOp | CompareOp | ShiftOp | AdditiveOp | MultiplicativeOp): op is CompareOp {
  return op === "==" || op === "!=" || op === ">" || op === "<" || op === ">=" || op === "<=";
}

function isLogicalOp(op: LogicalOp | BitwiseOp | CompareOp | ShiftOp | AdditiveOp | MultiplicativeOp): op is LogicalOp {
  return op === "&&" || op === "||";
}

function isBitwiseOp(op: LogicalOp | BitwiseOp | CompareOp | ShiftOp | AdditiveOp | MultiplicativeOp): op is BitwiseOp {
  return op === "&" || op === "^" || op === "|";
}

function isShiftOp(op: LogicalOp | BitwiseOp | CompareOp | ShiftOp | AdditiveOp | MultiplicativeOp): op is ShiftOp {
  return op === "<<" || op === ">>";
}

function isMultiplicativeOp(op: LogicalOp | BitwiseOp | CompareOp | ShiftOp | AdditiveOp | MultiplicativeOp): op is MultiplicativeOp {
  return op === "*" || op === "/" || op === "%";
}

function toSemanticType(type: SourceType | ScalarType): SemanticType {
  if (typeof type === "string") {
    return toSemanticScalarType(type);
  }
  if (type.kind === "scalar") {
    return toSemanticScalarType(type.name);
  }
  if (type.kind === "aggregate") {
    const layout = currentAggregateLayouts.get(`${type.aggregateKind}:${type.name}`);
    if (!layout) {
      throw new Error(`Unknown aggregate type '${type.aggregateKind} ${type.name}'.`);
    }
    return {
      kind: "aggregate",
      aggregateKind: type.aggregateKind,
      name: type.name,
      size: layout.size,
    };
  }
  if (type.kind === "pointer") {
    return toSemanticPointerType(type.pointee);
  }
  return {
    kind: "array",
    elementType: type.elementType,
    length: type.length,
  };
}

function toSemanticScalarType(type: ScalarType): SemanticScalarType {
  return {
    kind: "scalar",
    name: type,
    width: type === "char" ? 1 : 2,
  };
}

function toSemanticPointerType(pointee: PointerPointee): SemanticPointerType {
  return {
    kind: "pointer",
    pointee,
    width: 2,
  };
}

function getTypeStorageBytes(type: SourceType): number {
  if (type.kind === "scalar") {
    return type.name === "char" ? 1 : 2;
  }
  if (type.kind === "aggregate") {
    const layout = currentAggregateLayouts.get(`${type.aggregateKind}:${type.name}`);
    if (!layout) {
      throw new Error(`Unknown aggregate type '${type.aggregateKind} ${type.name}'.`);
    }
    return layout.size;
  }
  if (type.kind === "pointer") {
    return 2;
  }
  if (type.length === undefined) {
    throw new Error(`Unsized arrays are only supported for parameters, got ${JSON.stringify(type)}`);
  }
  return type.length;
}

function getBoundExprStorageBytes(expr: BoundExpr): number {
  switch (expr.kind) {
    case "const":
    case "string":
    case "ref":
    case "call":
    case "preIncDec":
    case "postIncDec":
    case "assign":
    case "compare":
    case "logical":
    case "bitwise":
    case "shift":
    case "multiplicative":
    case "additive":
    case "conditional":
      return expr.type.width;
    case "localAddress":
    case "aggregateFieldAccess":
    case "aggregateValueFieldAccess":
    case "pointerAdd":
    case "deref":
    case "derefAssign":
    case "derefIncDec":
      return expr.type.width;
    case "localArrayElement":
    case "paramArrayElement":
    case "preArrayIncDec":
    case "postArrayIncDec":
    case "arrayAssignExpr":
    case "comma":
      return expr.type.width;
    default:
      return assertNever(expr);
  }
}

function getSourceExprStorageBytes(
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): number {
  if (expr.kind === "ref") {
    const symbol = lookupVisible(scope, expr.name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param")) {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not know symbol '${expr.name}'.`, {
        file,
        offset: 0,
      });
    }
    return symbol.type.kind === "array"
      ? symbol.type.length ?? 2
      : symbol.type.kind === "aggregate"
        ? symbol.type.size
        : symbol.type.width;
  }
  const boundExpr = analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file);
  return getBoundExprStorageBytes(boundExpr);
}

function getScalarSourceType(type: SourceType): Extract<SourceType, { kind: "scalar" }> {
  if (type.kind !== "scalar") {
    throw new Error(`Expected scalar source type, got ${JSON.stringify(type)}`);
  }
  return type;
}

function getScalarSemanticType(type: SemanticType): SemanticScalarType {
  if (type.kind !== "scalar") {
    throw new Error(`Expected scalar semantic type, got ${JSON.stringify(type)}`);
  }
  return type;
}

function getValueSemanticType(type: SemanticType): SemanticScalarType | SemanticPointerType {
  if (type.kind === "array" || type.kind === "aggregate") {
    throw new Error(`Expected scalar or pointer semantic type, got ${JSON.stringify(type)}`);
  }
  return type;
}

function getConditionalResultType(
  thenExpr: BoundExpr,
  elseExpr: BoundExpr,
  functionName: string,
  sourceText: string,
  file?: string,
): SemanticScalarType | SemanticPointerType {
  if (thenExpr.type.kind === "pointer" && elseExpr.type.kind === "pointer") {
    if (samePointerType(thenExpr.type, elseExpr.type)) {
      return thenExpr.type;
    }
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports conditional expressions with matching pointer branch types in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  if (thenExpr.type.kind === "pointer" && isZeroConstantExpr(elseExpr)) {
    return thenExpr.type;
  }
  if (elseExpr.type.kind === "pointer" && isZeroConstantExpr(thenExpr)) {
    return elseExpr.type;
  }
  return toSemanticScalarType("int");
}

function samePointerType(left: SemanticPointerType, right: SemanticPointerType): boolean {
  if (typeof left.pointee === "string" || typeof right.pointee === "string") {
    return left.pointee === right.pointee;
  }
  return left.pointee.aggregateKind === right.pointee.aggregateKind && left.pointee.name === right.pointee.name;
}

function isZeroConstantExpr(expr: BoundExpr): boolean {
  return expr.kind === "const" && expr.value === 0;
}

function getScalarPointerPointee(
  type: SemanticPointerType,
  functionName: string,
  sourceText: string,
  file?: string,
): ScalarType {
  if (typeof type.pointee === "string") {
    return type.pointee;
  }
  throwDiagnostic(
    sourceText,
    `TsSccCompilerAdapter Phase C subset does not yet support ${formatAggregateTypeRef(type.pointee)} pointee layout operations in ${functionName}().`,
    { file, offset: 0 },
  );
}

function formatAggregateTypeRef(type: AggregateTypeRef): string {
  return `${type.aggregateKind} ${type.name}`;
}

function buildAggregateLayouts(
  defs: SourceAggregateDef[],
  sourceText: string,
  file?: string,
): Map<string, AggregateLayout> {
  const layouts = new Map<string, AggregateLayout>();
  for (const def of defs) {
    const key = `${def.aggregateKind}:${def.name}`;
    if (layouts.has(key)) {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate ${def.aggregateKind} tag '${def.name}'.`, {
        file,
        offset: 0,
      });
    }
    const fields = new Map<string, { offset: number; type: ScalarType }>();
    let runningOffset = 0;
    for (const field of def.fields) {
      if (fields.has(field.name)) {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate field '${field.name}' in ${def.aggregateKind} ${def.name}.`, {
          file,
          offset: 0,
        });
      }
      fields.set(field.name, {
        offset: def.aggregateKind === "struct" ? runningOffset : 0,
        type: field.type.name,
      });
      if (def.aggregateKind === "struct") {
        runningOffset += getTypeStorageBytes(field.type);
      }
    }
    const fieldSizes = def.fields.map((field) => getTypeStorageBytes(field.type));
    layouts.set(key, {
      kind: "aggregateLayout",
      aggregateKind: def.aggregateKind,
      name: def.name,
      size: def.aggregateKind === "struct"
        ? fieldSizes.reduce((sum, size) => sum + size, 0)
        : Math.max(0, ...fieldSizes),
      fields,
    });
  }
  return layouts;
}

function getAggregateFieldLayout(
  type: SemanticAggregateType,
  fieldName: string,
  functionName: string,
  sourceText: string,
  file?: string,
): { offset: number; type: ScalarType } {
  const layout = currentAggregateLayouts.get(`${type.aggregateKind}:${type.name}`);
  if (!layout) {
    throw new Error(`Unknown aggregate type '${type.aggregateKind} ${type.name}'.`);
  }
  const field = layout.fields.get(fieldName);
  if (!field) {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support unknown field '${fieldName}' on ${type.aggregateKind} ${type.name} in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  return field;
}

function getPointerAggregateFieldTarget(
  name: string,
  fieldName: string,
  scope: Scope,
  functionName: string,
  sourceText: string,
  file?: string,
): {
  symbol: (BoundLocalSymbol | BoundParamSymbol) & { type: SemanticPointerType };
  field: { offset: number; type: ScalarType };
} {
  const symbol = lookupVisible(scope, name);
  if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || symbol.type.kind !== "pointer" || typeof symbol.type.pointee === "string") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers, got '${name}->${fieldName}' in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  const layout = currentAggregateLayouts.get(`${symbol.type.pointee.aggregateKind}:${symbol.type.pointee.name}`);
  if (!layout) {
    throw new Error(`Unknown aggregate type '${symbol.type.pointee.aggregateKind} ${symbol.type.pointee.name}'.`);
  }
  const field = layout.fields.get(fieldName);
  if (!field) {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support unknown field '${fieldName}' on ${symbol.type.pointee.aggregateKind} ${symbol.type.pointee.name} in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  return {
    symbol: symbol as (BoundLocalSymbol | BoundParamSymbol) & { type: SemanticPointerType },
    field,
  };
}

function getPointerAggregateFieldFromExpr(
  pointer: BoundExpr,
  fieldName: string,
  functionName: string,
  sourceText: string,
  file?: string,
): { field: { offset: number; type: ScalarType } } {
  if (pointer.type.kind !== "pointer" || typeof pointer.type.pointee === "string") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointer expressions in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  const layout = currentAggregateLayouts.get(`${pointer.type.pointee.aggregateKind}:${pointer.type.pointee.name}`);
  if (!layout) {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not know ${formatAggregateTypeRef(pointer.type.pointee)} for pointer-member access in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  const field = layout.fields.get(fieldName);
  if (!field) {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not know field '${fieldName}' on ${formatAggregateTypeRef(pointer.type.pointee)} in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  return { field };
}

function getSizedArrayLength(type: SemanticArrayType): number {
  if (type.length === undefined) {
    throw new Error(`Expected sized array type, got ${JSON.stringify(type)}`);
  }
  return type.length;
}

function assertUniqueSwitchCaseValues(
  cases: Array<{ value: number }>,
  functionName: string,
  sourceText: string,
  file?: string,
): void {
  const seen = new Set<number>();
  for (const entry of cases) {
    if (seen.has(entry.value)) {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate case value '${entry.value}' in ${functionName}().`, {
        file,
        offset: 0,
      });
    }
    seen.add(entry.value);
  }
}

function assertArrayIndexInBounds(
  index: BoundExpr,
  name: string,
  length: number,
  functionName: string,
  sourceText: string,
  file?: string,
): void {
  if (index.kind !== "const") {
    return;
  }
  if (index.value >= 0 && index.value < length) {
    return;
  }
  throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset array index ${index.value} is out of bounds for '${name}[${length}]' in ${functionName}().`, {
    file,
    offset: 0,
  });
}

function assertControlNesting(
  depth: number,
  functionName: string,
  sourceText: string,
  file?: string,
): void {
  if (depth <= MAX_CONTROL_NESTING) {
    return;
  }
  throwDiagnostic(
    sourceText,
    `TsSccCompilerAdapter Phase C subset only supports control-flow nesting up to ${MAX_CONTROL_NESTING} levels in ${functionName}().`,
    { file, offset: 0 },
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled semantic node: ${JSON.stringify(value)}`);
}

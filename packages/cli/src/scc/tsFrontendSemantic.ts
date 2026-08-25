import {
  AggregateKind,
  AggregateTypeRef,
  AdditiveOp,
  BitwiseOp,
  CompareOp,
  FunctionPointerTypeRef,
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
  SourceInitializer,
  SourceSimpleStmt,
  SourceGlobalDecl,
  SourceProgram,
  SourceStmt,
  SourceType,
  VoidTypeRef,
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
  elementType: ScalarType;
  elementValueType?: SemanticAggregateType | SemanticPointerType | SemanticFunctionPointerType;
  dimensions?: number[];
  length?: number;
};

export type SemanticPointerType = {
  kind: "pointer";
  pointee: PointerPointee;
  width: 2;
};

export type SemanticFunctionPointerType = {
  kind: "functionPointer";
  returnType: SemanticType;
  params: SemanticType[];
  width: 2;
};

export type SemanticAggregateType = {
  kind: "aggregate";
  aggregateKind: AggregateKind;
  name: string;
  size: number;
};

export type SemanticVoidType = VoidTypeRef;

export type SemanticType = SemanticVoidType | SemanticScalarType | SemanticArrayType | SemanticPointerType | SemanticFunctionPointerType | SemanticAggregateType;

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

export type BoundGlobalSymbol = {
  kind: "global";
  name: string;
  type: SemanticType;
  isStatic?: boolean;
  isExtern?: boolean;
  initializer?: SourceInitializer;
};

type BoundSymbol = BoundFunctionSymbol | BoundParamSymbol | BoundLocalSymbol | BoundGlobalSymbol;

export type BoundProgram = {
  kind: "boundProgram";
  globals: BoundGlobalSymbol[];
  functions: BoundFunction[];
};

export type BoundFunction = {
  kind: "boundFunction";
  name: string;
  isStatic?: boolean;
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

// BoundAggregateValueExpr is the semantic aggregate producer tree.
export type BoundAggregateValueExpr =
  | { kind: "aggregateRef"; symbol: (BoundLocalSymbol | BoundParamSymbol | BoundGlobalSymbol) & { type: SemanticAggregateType }; type: SemanticAggregateType }
  | { kind: "aggregateAddress"; pointer: BoundExpr; type: SemanticAggregateType }
  | { kind: "aggregateAssignExpr"; target: (BoundLocalSymbol | BoundGlobalSymbol) & { type: SemanticAggregateType }; source: BoundAggregateValueExpr; type: SemanticAggregateType }
  | { kind: "call"; target: BoundFunctionSymbol; args: BoundCallArg[]; type: SemanticAggregateType }
  | { kind: "indirectCall"; target: BoundExpr; signature: SemanticFunctionPointerType; args: BoundCallArg[]; type: SemanticAggregateType }
  | { kind: "comma"; left: BoundExpr; right: BoundAggregateValueExpr; type: SemanticAggregateType }
  | { kind: "conditional"; condition: BoundExpr; thenExpr: BoundAggregateValueExpr; elseExpr: BoundAggregateValueExpr; type: SemanticAggregateType };

export type BoundCallArg = BoundExpr | BoundAggregateValueExpr;

export type BoundStmt =
  | { kind: "return"; expr: BoundExpr | BoundAggregateValueExpr }
  | { kind: "returnVoid" }
  | { kind: "expr"; expr: BoundExpr }
  | { kind: "if"; condition: BoundExpr; thenBlock: BoundBlock; elseBlock?: BoundBlock }
  | { kind: "while"; condition: BoundExpr; body: BoundBlock }
  | { kind: "doWhile"; body: BoundBlock; condition: BoundExpr }
  | { kind: "for"; initializer?: BoundForInit; condition?: BoundExpr; step?: BoundSimpleStmt; body: BoundBlock }
  | { kind: "switch"; expr: BoundExpr; cases: BoundSwitchCase[]; defaultCase?: BoundBlock }
  | { kind: "assign"; local: BoundLocalSymbol; expr: BoundExpr }
  | { kind: "aggregateAssign"; target: BoundLocalSymbol | BoundGlobalSymbol | { kind: "aggregateAddress"; pointer: BoundExpr; type: SemanticAggregateType }; source: BoundAggregateValueExpr }
  | { kind: "arrayAssign"; target: BoundLocalSymbol | BoundParamSymbol; index: BoundExpr; expr: BoundExpr }
  | { kind: "break" }
  | { kind: "continue" };

export type BoundSimpleStmt =
  | { kind: "expr"; expr: BoundExpr }
  | { kind: "assign"; local: BoundLocalSymbol; expr: BoundExpr }
  | { kind: "aggregateAssign"; target: BoundLocalSymbol | BoundGlobalSymbol | { kind: "aggregateAddress"; pointer: BoundExpr; type: SemanticAggregateType }; source: BoundAggregateValueExpr }
  | { kind: "arrayAssign"; target: BoundLocalSymbol | BoundParamSymbol; index: BoundExpr; expr: BoundExpr };

export type BoundForInit =
  | BoundSimpleStmt
  | { kind: "localDecl"; local: BoundLocalSymbol; initializer?: BoundExpr | BoundAggregateValueExpr; initStatements?: BoundSimpleStmt[] }
  | { kind: "staticDecl" };

export type BoundExpr =
  | { kind: "const"; value: number; type: SemanticScalarType }
  | { kind: "string"; value: string; type: SemanticScalarType }
  | { kind: "ref"; symbol: BoundParamSymbol | BoundLocalSymbol; type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType }
  | { kind: "globalRef"; symbol: BoundGlobalSymbol; type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType }
  | { kind: "functionAddress"; name: string; type: SemanticFunctionPointerType }
  | { kind: "localAddress"; symbol: BoundLocalSymbol; type: SemanticPointerType }
  | { kind: "globalAddress"; symbol: BoundGlobalSymbol; type: SemanticPointerType }
  | { kind: "aggregateFieldAccess"; symbol: BoundLocalSymbol | BoundParamSymbol | BoundGlobalSymbol; offset: number; type: SemanticScalarType }
  | { kind: "aggregateProducerFieldRead"; source: BoundAggregateValueExpr; offset: number; type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType }
  | { kind: "aggregateProducerFieldAddress"; source: BoundAggregateValueExpr; offset: number; type: SemanticPointerType }
  | { kind: "pointerAdd"; pointer: BoundExpr; index: BoundExpr; pointee: PointerPointee; type: SemanticPointerType }
  | { kind: "arrayElementAddress"; base: BoundExpr; indices: BoundExpr[]; scales: number[]; type: SemanticPointerType }
  | { kind: "localArrayElement"; symbol: BoundLocalSymbol; index: BoundExpr; type: SemanticScalarType }
  | { kind: "paramArrayElement"; symbol: BoundParamSymbol; index: BoundExpr; type: SemanticScalarType }
  | { kind: "globalArrayElement"; symbol: BoundGlobalSymbol; index: BoundExpr; type: SemanticScalarType }
  | { kind: "deref"; pointer: BoundExpr; type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType }
  | { kind: "derefAssign"; pointer: BoundExpr; expr: BoundExpr; type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType }
  | { kind: "call"; target: BoundFunctionSymbol | { kind: "extern"; name: string }; args: BoundCallArg[]; type: SemanticScalarType | SemanticPointerType }
  | { kind: "indirectCall"; target: BoundExpr; signature: SemanticFunctionPointerType; args: BoundCallArg[]; type: SemanticScalarType | SemanticPointerType }
  | { kind: "preIncDec"; local: BoundLocalSymbol; op: "++" | "--"; type: SemanticScalarType | SemanticPointerType }
  | { kind: "postIncDec"; local: BoundLocalSymbol; op: "++" | "--"; type: SemanticScalarType | SemanticPointerType }
  | { kind: "preArrayIncDec"; target: BoundLocalSymbol | BoundParamSymbol; index: BoundExpr; op: "++" | "--"; type: SemanticScalarType }
  | { kind: "postArrayIncDec"; target: BoundLocalSymbol | BoundParamSymbol; index: BoundExpr; op: "++" | "--"; type: SemanticScalarType }
  | { kind: "derefIncDec"; pointer: BoundExpr; op: "++" | "--"; mode: "prefix" | "postfix"; type: SemanticScalarType }
  | { kind: "assign"; local: BoundLocalSymbol; expr: BoundExpr; type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType }
  | { kind: "assignGlobal"; global: BoundGlobalSymbol; expr: BoundExpr; type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType }
  | { kind: "arrayAssignExpr"; target: BoundLocalSymbol | BoundParamSymbol; index: BoundExpr; expr: BoundExpr; type: SemanticScalarType }
  | { kind: "globalArrayAssignExpr"; target: BoundGlobalSymbol; index: BoundExpr; expr: BoundExpr; type: SemanticScalarType }
  | { kind: "cast"; expr: BoundExpr; type: SemanticScalarType | SemanticPointerType }
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
  fields: Map<string, AggregateFieldLayout>;
};

type AggregateFieldLayout = {
  offset: number;
  type: SourceType;
  size: number;
};

export function getAggregateLayoutFields(type: Pick<SemanticAggregateType, "aggregateKind" | "name">): Array<{ name: string; type: SourceType; size: number }> {
  const layout = currentAggregateLayouts.get(`${type.aggregateKind}:${type.name}`);
  if (!layout) {
    throw new Error(`Unknown aggregate layout '${type.aggregateKind} ${type.name}'.`);
  }
  return Array.from(layout.fields.entries())
    .sort((left, right) => left[1].offset - right[1].offset)
    .map(([name, field]) => ({ name, type: field.type, size: field.size }));
}

export function getAggregateLayoutSize(type: Pick<SemanticAggregateType, "aggregateKind" | "name">): number {
  const layout = currentAggregateLayouts.get(`${type.aggregateKind}:${type.name}`);
  if (!layout) {
    throw new Error(`Unknown aggregate layout '${type.aggregateKind} ${type.name}'.`);
  }
  return layout.size;
}

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
  const globals = program.globals.map((globalDecl) => analyzeGlobalDecl(globalDecl, sourceText, file));

  return {
    kind: "boundProgram",
    globals,
    functions: program.functions.map((fn) => analyzeFunction(fn, globals, functionSymbols, sourceText, file)),
  };
}

function analyzeGlobalDecl(globalDecl: SourceGlobalDecl, sourceText: string, file?: string): BoundGlobalSymbol {
  return {
    kind: "global",
    name: globalDecl.name,
    type: toSemanticType(globalDecl.type),
    ...(globalDecl.isStatic ? { isStatic: true } : {}),
    ...(globalDecl.isExtern ? { isExtern: true } : {}),
    initializer: globalDecl.initializer,
  };
}

function analyzeFunction(
  fn: SourceFunction,
  globals: BoundGlobalSymbol[],
  functionSymbols: Map<string, BoundFunctionSymbol>,
  sourceText: string,
  file?: string,
): BoundFunction {
  const functionScope: Scope = { entries: new Map() };
  for (const global of globals) {
    functionScope.entries.set(global.name, global);
  }
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
  const body = analyzeBlock(fn.body, functionScope, allLocals, localList, globals, functionSymbols, fn.name, sourceText, file, 0);
  return {
    kind: "boundFunction",
    name: fn.name,
    ...(fn.isStatic ? { isStatic: true } : {}),
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
  globals: BoundGlobalSymbol[],
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
    if (declaration.isStatic) {
      if (declaration.initializer && !isStaticStorageInitializer(declaration.initializer)) {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter C Subset requires a static-data initializer for static local '${declaration.name}' in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      const symbol: BoundGlobalSymbol = {
        kind: "global",
        name: `__scc_static_${functionName}_${globals.length}`,
        type: toSemanticType(declaration.type),
        initializer: declaration.initializer,
      };
      globals.push(symbol);
      scope.entries.set(declaration.name, symbol);
      continue;
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
    statements: block.statements.map((stmt) => analyzeStmt(stmt, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth, controlNesting)),
  };
}

function isStaticStorageInitializer(initializer: SourceInitializer): boolean {
  if (initializer.kind === "list") {
    return initializer.items.every((item) => isStaticStorageInitializer(item));
  }
  switch (initializer.expr.kind) {
    case "const":
    case "string":
    case "addressOf":
      return true;
    default:
      return false;
  }
}

function analyzeStmt(
  stmt: SourceStmt,
  scope: Scope,
  allLocals: Map<string, BoundLocalSymbol>,
  localList: BoundLocalSymbol[],
  globals: BoundGlobalSymbol[],
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
        if (fnSymbol.returnType.kind === "void") {
          throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support returning a value from void ${functionName}().`, {
            file,
            offset: 0,
          });
        }
        return {
          kind: "return",
          expr: fnSymbol.returnType.kind === "aggregate"
            ? analyzeAggregateProducerExpr(stmt.expr, scope, functionSymbols, fnSymbol.returnType, functionName, sourceText, file)
            : analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
        };
      }
    case "returnVoid":
      {
        const fnSymbol = functionSymbols.get(functionName);
        if (!fnSymbol) {
          throw new Error(`Unknown function symbol '${functionName}'.`);
        }
        if (fnSymbol.returnType.kind !== "void") {
          throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset requires a return value in non-void ${functionName}().`, {
            file,
            offset: 0,
          });
        }
        return { kind: "returnVoid" };
      }
    case "expr": {
      if (stmt.expr.kind === "derefAssign") {
        try {
          const target = getAggregateBasePointerFromExpr(stmt.expr.target, scope, functionSymbols, functionName, sourceText, file);
          return {
            kind: "aggregateAssign",
            target: { kind: "aggregateAddress", pointer: target.pointer, type: target.type },
            source: analyzeAggregateProducerExpr(stmt.expr.expr, scope, functionSymbols, target.type, functionName, sourceText, file),
          };
        } catch {
          // Scalar dereference assignments continue through the normal expression path.
        }
      }
      return { kind: "expr", expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file) };
    }
    case "if":
      assertControlNesting(controlNesting + 1, functionName, sourceText, file);
      return {
        kind: "if",
        condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
        thenBlock: analyzeBlock(stmt.thenBlock, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth, controlNesting + 1),
        elseBlock: stmt.elseBlock
          ? analyzeBlock(stmt.elseBlock, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth, controlNesting + 1)
          : undefined,
      };
    case "while":
      assertControlNesting(controlNesting + 1, functionName, sourceText, file);
      return {
        kind: "while",
        condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
        body: analyzeBlock(stmt.body, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth + 1, breakDepth + 1, controlNesting + 1),
      };
    case "doWhile":
      assertControlNesting(controlNesting + 1, functionName, sourceText, file);
      return {
        kind: "doWhile",
        body: analyzeBlock(stmt.body, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth + 1, breakDepth + 1, controlNesting + 1),
        condition: analyzeExpr(stmt.condition, scope, functionSymbols, functionName, sourceText, file),
      };
    case "for":
      {
        assertControlNesting(controlNesting + 1, functionName, sourceText, file);
        const forScope: Scope = { parent: scope, entries: new Map() };
        let initializer: BoundForInit | undefined;
        if (stmt.initializer) {
          initializer = analyzeForInitializer(stmt.initializer, forScope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file);
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
        body: analyzeBlock(stmt.body, forScope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth + 1, breakDepth + 1, controlNesting + 1),
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
          body: analyzeBlock(entry.body, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth + 1, controlNesting + 1),
        })),
        defaultCase: stmt.defaultCase
          ? analyzeBlock(stmt.defaultCase, scope, allLocals, localList, globals, functionSymbols, functionName, sourceText, file, loopDepth, breakDepth + 1, controlNesting + 1)
          : undefined,
      };
    case "assign": {
      const symbol = lookupVisible(scope, stmt.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind === "array") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local/global scalar or pointer symbols, got '${stmt.name}'.`, {
          file,
          offset: 0,
        });
      }
      if (symbol.kind === "global") {
        if (symbol.type.kind === "aggregate") {
          return analyzeAggregateAssignStmt(symbol as BoundGlobalSymbol & { type: SemanticAggregateType }, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
        }
        return {
          kind: "expr",
          expr: {
            kind: "assignGlobal",
            global: symbol,
            expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
            type: symbol.type.kind === "functionPointer" ? symbol.type : getValueSemanticType(symbol.type),
          },
        };
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
    case "memberAssign": {
      const aggregateAssign = analyzeDirectAggregateFieldAssignStmt(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
      if (aggregateAssign) {
        return aggregateAssign;
      }
      return {
        kind: "expr",
        expr: analyzeAggregateFieldAssignExpr(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
      };
    }
    case "memberExprAssign": {
      const aggregateAssign = analyzeAggregateFieldAssignStmtTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
      if (aggregateAssign) {
        return aggregateAssign;
      }
      return {
        kind: "expr",
        expr: analyzeAggregateFieldAssignExprTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
      };
    }
    case "memberArrayAssign":
      return {
        kind: "expr",
        expr: analyzeAggregateArrayFieldAssignExprTarget(stmt.target, stmt.field, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
      };
    case "pointerMemberArrayAssign":
      return {
        kind: "expr",
        expr: analyzePointerAggregateArrayFieldAssignExpr(stmt.name, stmt.field, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
      };
    case "pointerMemberAssign": {
      const aggregateAssign = analyzePointerAggregateFieldAssignStmt({ kind: "ref", name: stmt.name }, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
      if (aggregateAssign) {
        return aggregateAssign;
      }
      return {
        kind: "expr",
        expr: analyzePointerAggregateFieldAssignExpr(stmt.name, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
      };
    }
    case "pointerMemberExprAssign": {
      const aggregateAssign = analyzePointerAggregateFieldAssignStmt(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
      if (aggregateAssign) {
        return aggregateAssign;
      }
      return {
        kind: "expr",
        expr: analyzePointerAggregateFieldAssignExprTarget(stmt.target, stmt.field, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
      };
    }
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
  if (stmt.kind === "memberArrayAssign") {
    return {
      kind: "expr",
      expr: analyzeAggregateArrayFieldAssignExprTarget(stmt.target, stmt.field, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
    };
  }
  if (stmt.kind === "pointerMemberArrayAssign") {
    return {
      kind: "expr",
      expr: analyzePointerAggregateArrayFieldAssignExpr(stmt.name, stmt.field, stmt.index, stmt.expr, scope, functionSymbols, functionName, sourceText, file),
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
  if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind === "array") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local symbols, got '${stmt.name}'.`, {
      file,
      offset: 0,
    });
  }
  if (symbol.kind === "global") {
    if (symbol.type.kind === "aggregate") {
      return analyzeAggregateAssignSimpleStmt(symbol as BoundGlobalSymbol & { type: SemanticAggregateType }, stmt.expr, scope, functionSymbols, functionName, sourceText, file);
    }
    return {
      kind: "expr",
      expr: {
        kind: "assignGlobal",
        global: symbol,
        expr: analyzeExpr(stmt.expr, scope, functionSymbols, functionName, sourceText, file),
        type: getValueSemanticType(symbol.type),
      },
    };
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
  target: (BoundLocalSymbol | BoundGlobalSymbol) & { type: SemanticAggregateType },
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundStmt, { kind: "aggregateAssign" }> {
  const source = analyzeAggregateProducerExpr(expr, scope, functionSymbols, target.type, functionName, sourceText, file);
  return {
    kind: "aggregateAssign",
    target,
    source,
  };
}

function analyzeAggregateAssignSimpleStmt(
  target: (BoundLocalSymbol | BoundGlobalSymbol) & { type: SemanticAggregateType },
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundSimpleStmt, { kind: "aggregateAssign" }> {
  const source = analyzeAggregateProducerExpr(expr, scope, functionSymbols, target.type, functionName, sourceText, file);
  return {
    kind: "aggregateAssign",
    target,
    source,
  };
}

function analyzeAggregateProducerExpr(
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  targetType: SemanticAggregateType | undefined,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundAggregateValueExpr {
  switch (expr.kind) {
    case "arrayIndex":
    case "arrayPointerElement": {
      const target = getAggregateBasePointerFromExpr(expr, scope, functionSymbols, functionName, sourceText, file);
      if (targetType) {
        assertMatchingAggregateType(target.type, targetType, functionName, sourceText, file);
      }
      return { kind: "aggregateAddress", pointer: target.pointer, type: target.type };
    }
    case "ref": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value expressions from local/parameter/global aggregate symbols in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      const aggregateSymbol = symbol as (BoundLocalSymbol | BoundParamSymbol | BoundGlobalSymbol) & { type: SemanticAggregateType };
      if (targetType) {
        assertMatchingAggregateType(aggregateSymbol.type, targetType, functionName, sourceText, file);
      }
      return {
        kind: "aggregateRef",
        symbol: aggregateSymbol,
        type: aggregateSymbol.type,
      };
    }
    case "assign": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate assignment expressions to local/global struct/union objects in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      const aggregateTarget = symbol as (BoundLocalSymbol | BoundGlobalSymbol) & { type: SemanticAggregateType };
      const source = analyzeAggregateProducerExpr(expr.expr, scope, functionSymbols, aggregateTarget.type, functionName, sourceText, file);
      if (targetType) {
        assertMatchingAggregateType(aggregateTarget.type, targetType, functionName, sourceText, file);
      }
      return {
        kind: "aggregateAssignExpr",
        target: aggregateTarget,
        source,
        type: aggregateTarget.type,
      };
    }
    case "comma":
      {
      const right = analyzeAggregateProducerExpr(expr.right, scope, functionSymbols, targetType, functionName, sourceText, file);
      return {
        kind: "comma",
        left: analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file),
        right,
        type: right.type,
      };
      }
    case "conditional": {
      const thenExpr = analyzeAggregateProducerExpr(expr.thenExpr, scope, functionSymbols, targetType, functionName, sourceText, file);
      const elseExpr = analyzeAggregateProducerExpr(expr.elseExpr, scope, functionSymbols, thenExpr.type, functionName, sourceText, file);
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
            ? analyzeAggregateProducerExpr(arg, scope, functionSymbols, paramType, functionName, sourceText, file)
            : analyzeExpr(arg, scope, functionSymbols, functionName, sourceText, file);
        }),
        type: target.returnType,
      };
    }
    case "indirectCall": {
      const target = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
      if (target.type.kind !== "functionPointer") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value calls through aggregate-returning function pointers in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      const signature = target.type;
      const returnType = signature.returnType;
      if (returnType.kind !== "aggregate") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value calls through aggregate-returning function pointers in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      if (signature.params.length !== expr.args.length) {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset expected ${signature.params.length} argument(s) for indirect aggregate call, got ${expr.args.length}.`, {
          file,
          offset: 0,
        });
      }
      if (targetType) {
        assertMatchingAggregateType(returnType, targetType, functionName, sourceText, file);
      }
      return {
        kind: "indirectCall",
        target,
        signature,
        args: expr.args.map((arg, index) => analyzeCallArg(arg, signature.params[index], scope, functionSymbols, functionName, sourceText, file)),
        type: returnType,
      };
    }
    default:
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate value expressions from local/parameter/global aggregate symbols in ${functionName}().`, {
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
): Extract<BoundStmt, { kind: "arrayAssign" | "expr" }> {
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
  if (symbol.type.elementValueType) {
    if (symbol.type.elementValueType.kind === "aggregate") {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter C Subset requires aggregate array assignments to be used as statements in ${functionName}().`, { file, offset: 0 });
    }
    const elementPointee = toArrayElementPointee(symbol.type);
    return {
      kind: "expr",
      expr: {
        kind: "derefAssign",
        pointer: {
          kind: "pointerAdd",
          pointer: symbol.kind === "local"
            ? { kind: "localAddress", symbol, type: toSemanticPointerType(elementPointee) }
            : { kind: "ref", symbol, type: toSemanticPointerType(elementPointee) },
          index: boundIndex,
          pointee: elementPointee,
          type: toSemanticPointerType(elementPointee),
        },
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
        type: getArrayElementValueType(symbol.type),
      },
    };
  }
  if (symbol.type.elementType === "int") {
    return {
      kind: "expr",
      expr: {
        kind: "derefAssign",
        pointer: makeArrayElementPointer(symbol, boundIndex),
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
        type: toSemanticScalarType("int"),
      },
    };
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
  if (symbol && symbol.kind === "global" && symbol.type.kind === "array") {
    const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
    if (symbol.type.elementValueType) {
      if (symbol.type.elementValueType.kind === "aggregate") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter C Subset requires aggregate array assignments to be used as statements in ${functionName}().`, { file, offset: 0 });
      }
      const elementPointee = toArrayElementPointee(symbol.type);
      return {
        kind: "expr",
        expr: {
          kind: "derefAssign",
          pointer: {
            kind: "pointerAdd",
            pointer: { kind: "globalAddress", symbol, type: toSemanticPointerType(elementPointee) },
            index: boundIndex,
            pointee: elementPointee,
            type: toSemanticPointerType(elementPointee),
          },
          expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
          type: getArrayElementValueType(symbol.type),
        },
      };
    }
    if (symbol.type.elementType === "int") {
      return {
        kind: "expr",
        expr: {
          kind: "derefAssign",
          pointer: makeArrayElementPointer(symbol, boundIndex),
          expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
          type: toSemanticScalarType("int"),
        },
      };
    }
    return {
      kind: "expr",
      expr: {
        kind: "globalArrayAssignExpr",
        target: symbol,
        index: boundIndex,
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
        type: toSemanticScalarType("char"),
      },
    };
  }
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
  if (symbol && symbol.kind === "global" && symbol.type.kind === "array") {
    const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
    if (symbol.type.elementType === "int") {
      return {
        kind: "expr",
        expr: {
          kind: "derefAssign",
          pointer: makeArrayElementPointer(symbol, boundIndex),
          expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
          type: toSemanticScalarType("int"),
        },
      };
    }
    return {
      kind: "expr",
      expr: {
        kind: "globalArrayAssignExpr",
        target: symbol,
        index: boundIndex,
        expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
        type: toSemanticScalarType("char"),
      },
    };
  }
  if (symbol && (symbol.kind === "local" || symbol.kind === "param") && symbol.type.kind === "pointer") {
    return {
      kind: "expr",
      expr: analyzePointerIndexedAssignExpr(symbol, index, expr, scope, functionSymbols, functionName, sourceText, file),
    };
  }
  return analyzeArrayAssignStmt(name, index, expr, scope, functionSymbols, functionName, sourceText, file);
}

function makeArrayElementPointer(
  symbol: BoundLocalSymbol | BoundParamSymbol | BoundGlobalSymbol,
  index: BoundExpr,
): Extract<BoundExpr, { kind: "pointerAdd" }> {
  if (symbol.type.kind !== "array") {
    throw new Error(`Expected array symbol, got ${JSON.stringify(symbol.type)}.`);
  }
  const pointee = getArrayDecayPointee(symbol.type);
  const pointer = symbol.kind === "global"
    ? { kind: "globalAddress", symbol, type: toSemanticPointerType(pointee) } satisfies BoundExpr
    : symbol.kind === "local"
      ? { kind: "localAddress", symbol, type: toSemanticPointerType(pointee) } satisfies BoundExpr
      : { kind: "ref", symbol, type: toSemanticPointerType(pointee) } satisfies BoundExpr;
  return {
    kind: "pointerAdd",
    pointer,
    index,
    pointee,
    type: toSemanticPointerType(pointee),
  };
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
  if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports member assignment on local/global struct/union objects, got '${name}.${fieldName}'.`, {
      file,
      offset: 0,
    });
  }
  const field = getAssignableAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file);
  return {
    kind: "derefAssign",
    pointer: {
      kind: "pointerAdd",
      pointer: getAggregateStorageAddress(symbol, symbol.type),
      index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
      pointee: "char",
      type: toSemanticPointerType("char"),
    },
    expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
    type: field.type,
  };
}

function analyzeDirectAggregateFieldAssignStmt(
  name: string,
  fieldName: string,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundStmt, { kind: "aggregateAssign" }> | undefined {
  const symbol = lookupVisible(scope, name);
  if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
    return undefined;
  }
  const field = getAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file);
  if (field.type.kind !== "aggregate") {
    return undefined;
  }
  const fieldType = toSemanticType(field.type) as SemanticAggregateType;
  return {
    kind: "aggregateAssign",
    target: {
      kind: "aggregateAddress",
      pointer: {
        kind: "pointerAdd",
        pointer: getAggregateStorageAddress(symbol, symbol.type),
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: { kind: "aggregate", aggregateKind: fieldType.aggregateKind, name: fieldType.name },
        type: toSemanticPointerType({ kind: "aggregate", aggregateKind: fieldType.aggregateKind, name: fieldType.name }),
      },
      type: fieldType,
    },
    source: analyzeAggregateProducerExpr(expr, scope, functionSymbols, fieldType, functionName, sourceText, file),
  };
}

function analyzeAggregateFieldAssignStmtTarget(
  targetExpr: SourceExpr,
  fieldName: string,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundStmt, { kind: "aggregateAssign" }> | undefined {
  const baseTarget = getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
  return analyzeAggregateFieldAssignFromBase(baseTarget.pointer, baseTarget.type, fieldName, expr, scope, functionSymbols, functionName, sourceText, file);
}

function analyzePointerAggregateFieldAssignStmt(
  targetExpr: SourceExpr,
  fieldName: string,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundStmt, { kind: "aggregateAssign" }> | undefined {
  const pointer = analyzeExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
  const aggregatePointee = getAggregatePointerPointee(pointer.type as SemanticPointerType, functionName, sourceText, file);
  const aggregateType = toSemanticType({
    kind: "aggregate",
    aggregateKind: aggregatePointee.aggregateKind,
    name: aggregatePointee.name,
  }) as SemanticAggregateType;
  return analyzeAggregateFieldAssignFromBase(pointer, aggregateType, fieldName, expr, scope, functionSymbols, functionName, sourceText, file);
}

function analyzeAggregateFieldAssignFromBase(
  basePointer: BoundExpr,
  baseType: SemanticAggregateType,
  fieldName: string,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundStmt, { kind: "aggregateAssign" }> | undefined {
  const field = getAggregateFieldLayout(baseType, fieldName, functionName, sourceText, file);
  if (field.type.kind !== "aggregate") {
    return undefined;
  }
  const fieldType = toSemanticType(field.type) as SemanticAggregateType;
  return {
    kind: "aggregateAssign",
    target: {
      kind: "aggregateAddress",
      pointer: {
        kind: "pointerAdd",
        pointer: basePointer,
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: { kind: "aggregate", aggregateKind: fieldType.aggregateKind, name: fieldType.name },
        type: toSemanticPointerType({ kind: "aggregate", aggregateKind: fieldType.aggregateKind, name: fieldType.name }),
      },
      type: fieldType,
    },
    source: analyzeAggregateProducerExpr(expr, scope, functionSymbols, fieldType, functionName, sourceText, file),
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
  const symbol = lookupVisible(scope, name);
  if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || symbol.type.kind !== "pointer") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers, got '${name}->${fieldName}' in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  const aggregatePointee = getAggregatePointerPointee(symbol.type, functionName, sourceText, file);
  const field = getAssignableAggregateFieldLayout(
    toSemanticType({
      kind: "aggregate",
      aggregateKind: aggregatePointee.aggregateKind,
      name: aggregatePointee.name,
    }) as SemanticAggregateType,
    fieldName,
    functionName,
    sourceText,
    file,
  );
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
    type: field.type,
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
  const target = getAggregateFieldAssignablePointerFromTargetExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file);
  return {
    kind: "derefAssign",
    pointer: target.pointer,
    expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
    type: target.type,
  };
}

function analyzeAggregateArrayFieldAssignExprTarget(
  targetExpr: SourceExpr,
  fieldName: string,
  index: SourceExpr,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundExpr, { kind: "derefAssign" }> {
  const baseTarget = getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
  const field = getAggregateFieldLayout(baseTarget.type, fieldName, functionName, sourceText, file);
  if (field.type.kind !== "array") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports array field assignment on ${baseTarget.type.aggregateKind} ${baseTarget.type.name}.${fieldName} in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
  if (field.type.length !== undefined) {
    assertArrayIndexInBounds(boundIndex, `${baseTarget.type.name}.${fieldName}`, field.type.length, functionName, sourceText, file);
  }
  return {
    kind: "derefAssign",
    pointer: {
      kind: "pointerAdd",
      pointer: {
        kind: "pointerAdd",
        pointer: baseTarget.pointer,
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        // Aggregate field offsets are byte offsets; only the array index uses the element stride.
        pointee: "char",
        type: toSemanticPointerType("char"),
      },
      index: boundIndex,
      pointee: field.type.elementType,
      type: toSemanticPointerType(field.type.elementType),
    },
    expr: analyzeExpr(expr, scope, functionSymbols, functionName, sourceText, file),
    type: toSemanticScalarType(field.type.elementType),
  };
}

function analyzeAggregateArrayFieldIndexExpr(
  name: string,
  fieldName: string,
  index: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundExpr, { kind: "deref" }> {
  const symbol = lookupVisible(scope, name);
  if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate array-field access on local/global struct/union objects, got '${name}.${fieldName}[...]'.`, {
      file,
      offset: 0,
    });
  }
  const field = getAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file);
  if (field.type.kind !== "array") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports array field access on ${symbol.type.aggregateKind} ${symbol.type.name}.${fieldName} in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
  if (field.type.length !== undefined) {
    assertArrayIndexInBounds(boundIndex, `${symbol.type.name}.${fieldName}`, field.type.length, functionName, sourceText, file);
  }
  return {
    kind: "deref",
    pointer: {
      kind: "pointerAdd",
      pointer: {
        kind: "pointerAdd",
        pointer: symbol.kind === "param"
          ? {
            kind: "ref",
            symbol,
            type: toSemanticPointerType({ kind: "aggregate", aggregateKind: symbol.type.aggregateKind, name: symbol.type.name }),
          }
          : getAggregateStorageAddress(symbol, symbol.type),
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: "char",
        type: toSemanticPointerType("char"),
      },
      index: boundIndex,
      pointee: field.type.elementType,
      type: toSemanticPointerType(field.type.elementType),
    },
    type: toSemanticScalarType(field.type.elementType),
  };
}

function analyzeAggregateArrayFieldIndexExprTarget(
  targetExpr: SourceExpr,
  fieldName: string,
  index: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundExpr, { kind: "deref" }> {
  if (!isAggregateStorageExpr(targetExpr)) {
    const producerTarget = resolveAggregateProducerFieldTarget(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    const field = getAggregateFieldLayout(producerTarget.type, fieldName, functionName, sourceText, file);
    if (field.type.kind !== "array") {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports array field access on ${producerTarget.type.aggregateKind} ${producerTarget.type.name}.${fieldName} in ${functionName}().`, { file, offset: 0 });
    }
    const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
    if (field.type.length !== undefined) {
      assertArrayIndexInBounds(boundIndex, `${producerTarget.type.name}.${fieldName}`, field.type.length, functionName, sourceText, file);
    }
    return {
      kind: "deref",
      pointer: {
        kind: "pointerAdd",
        pointer: {
          kind: "aggregateProducerFieldAddress",
          source: producerTarget.source,
          offset: producerTarget.offset + field.offset,
          type: toSemanticPointerType("char"),
        },
        index: boundIndex,
        pointee: field.type.elementType,
        type: toSemanticPointerType(field.type.elementType),
      },
      type: toSemanticScalarType(field.type.elementType),
    };
  }
  const baseTarget = getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
  const field = getAggregateFieldLayout(baseTarget.type, fieldName, functionName, sourceText, file);
  if (field.type.kind !== "array") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports array field access on ${baseTarget.type.aggregateKind} ${baseTarget.type.name}.${fieldName} in ${functionName}().`, { file, offset: 0 });
  }
  const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
  if (field.type.length !== undefined) {
    assertArrayIndexInBounds(boundIndex, `${baseTarget.type.name}.${fieldName}`, field.type.length, functionName, sourceText, file);
  }
  return {
    kind: "deref",
    pointer: {
      kind: "pointerAdd",
      pointer: {
        kind: "pointerAdd",
        pointer: baseTarget.pointer,
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: "char",
        type: toSemanticPointerType("char"),
      },
      index: boundIndex,
      pointee: field.type.elementType,
      type: toSemanticPointerType(field.type.elementType),
    },
    type: toSemanticScalarType(field.type.elementType),
  };
}

function isAggregateStorageExpr(expr: SourceExpr): boolean {
  switch (expr.kind) {
    case "ref":
    case "deref":
    case "memberAccess":
    case "pointerMemberAccess":
    case "pointerMemberExprAccess":
    case "arrayPointerElement":
    case "arrayIndex":
      return true;
    case "memberExprAccess":
      return isAggregateStorageExpr(expr.target);
    default:
      return false;
  }
}

function resolveAggregateProducerFieldTarget(
  targetExpr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): { source: BoundAggregateValueExpr; type: SemanticAggregateType; offset: number } {
  if (targetExpr.kind === "memberExprAccess") {
    const parent = resolveAggregateProducerFieldTarget(targetExpr.target, scope, functionSymbols, functionName, sourceText, file);
    const field = getAggregateFieldLayout(parent.type, targetExpr.field, functionName, sourceText, file);
    if (field.type.kind !== "aggregate") {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports producer field chaining through aggregate fields in ${functionName}().`, { file, offset: 0 });
    }
    return {
      source: parent.source,
      type: toSemanticType(field.type) as SemanticAggregateType,
      offset: parent.offset + field.offset,
    };
  }
  const source = analyzeAggregateProducerExpr(targetExpr, scope, functionSymbols, undefined, functionName, sourceText, file);
  return { source, type: source.type, offset: 0 };
}

function getAggregateFieldLayoutForConsumerTarget(
  targetExpr: SourceExpr,
  fieldName: string,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): AggregateFieldLayout {
  const type = isAggregateStorageExpr(targetExpr)
    ? getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file).type
    : resolveAggregateProducerFieldTarget(targetExpr, scope, functionSymbols, functionName, sourceText, file).type;
  return getAggregateFieldLayout(type, fieldName, functionName, sourceText, file);
}

function getArrayFieldAddressFromConsumerExpr(
  expr: Extract<SourceExpr, { kind: "memberAccess" | "memberExprAccess" | "pointerMemberAccess" | "pointerMemberExprAccess" }>,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundExpr | null {
  const arrayPointerType = (elementType: ScalarType, length: number): SemanticPointerType =>
    toSemanticPointerType({ kind: "arrayPointer", elementType, length });
  const makeAddress = (pointer: BoundExpr, field: AggregateFieldLayout): BoundExpr => ({
    kind: "pointerAdd",
    pointer,
    index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
    pointee: "char",
    type: arrayPointerType((field.type as SemanticArrayType).elementType, getSizedArrayLength(field.type as SemanticArrayType)),
  });

  if (expr.kind === "pointerMemberAccess" || expr.kind === "pointerMemberExprAccess") {
    const pointer = expr.kind === "pointerMemberAccess"
      ? analyzeExpr({ kind: "ref", name: expr.name }, scope, functionSymbols, functionName, sourceText, file)
      : analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
    const aggregatePointee = getAggregatePointerPointee(pointer.type as SemanticPointerType, functionName, sourceText, file);
    const aggregateType = toSemanticType({
      kind: "aggregate",
      aggregateKind: aggregatePointee.aggregateKind,
      name: aggregatePointee.name,
    }) as SemanticAggregateType;
    const field = getAggregateFieldLayout(aggregateType, expr.field, functionName, sourceText, file);
    return field.type.kind === "array" && field.type.length !== undefined ? makeAddress(pointer, field) : null;
  }

  const baseExpr = expr.kind === "memberAccess"
    ? ({ kind: "ref", name: expr.name } satisfies SourceExpr)
    : expr.target;
  if (isAggregateStorageExpr(baseExpr)) {
    const base = getAggregateBasePointerFromExpr(baseExpr, scope, functionSymbols, functionName, sourceText, file);
    const field = getAggregateFieldLayout(base.type, expr.field, functionName, sourceText, file);
    return field.type.kind === "array" && field.type.length !== undefined ? makeAddress(base.pointer, field) : null;
  }

  const producer = resolveAggregateProducerFieldTarget(baseExpr, scope, functionSymbols, functionName, sourceText, file);
  const field = getAggregateFieldLayout(producer.type, expr.field, functionName, sourceText, file);
  if (field.type.kind !== "array" || field.type.length === undefined) {
    return null;
  }
  return {
    kind: "aggregateProducerFieldAddress",
    source: producer.source,
    offset: producer.offset + field.offset,
    type: arrayPointerType(field.type.elementType, field.type.length),
  };
}

function analyzePointerAggregateArrayFieldIndexExpr(
  name: string,
  fieldName: string,
  index: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundExpr, { kind: "deref" }> {
  const symbol = lookupVisible(scope, name);
  if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "pointer") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers, got '${name}->${fieldName}[...]' in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  const aggregatePointee = getAggregatePointerPointee(symbol.type, functionName, sourceText, file);
  const field = getAggregateFieldLayout(
    toSemanticType({
      kind: "aggregate",
      aggregateKind: aggregatePointee.aggregateKind,
      name: aggregatePointee.name,
    }) as SemanticAggregateType,
    fieldName,
    functionName,
    sourceText,
    file,
  );
  if (field.type.kind !== "array") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports array field access on ${aggregatePointee.aggregateKind} ${aggregatePointee.name}->${fieldName} in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
  if (field.type.length !== undefined) {
    assertArrayIndexInBounds(boundIndex, `${aggregatePointee.name}.${fieldName}`, field.type.length, functionName, sourceText, file);
  }
  return {
    kind: "deref",
    pointer: {
      kind: "pointerAdd",
      pointer: {
        kind: "pointerAdd",
        pointer: symbol.kind === "global"
          ? { kind: "globalRef", symbol, type: symbol.type }
          : { kind: "ref", symbol, type: symbol.type },
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: "char",
        type: toSemanticPointerType("char"),
      },
      index: boundIndex,
      pointee: field.type.elementType,
      type: toSemanticPointerType(field.type.elementType),
    },
    type: toSemanticScalarType(field.type.elementType),
  };
}

function analyzePointerAggregateArrayFieldIndexExprTarget(
  targetExpr: SourceExpr,
  fieldName: string,
  index: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundExpr, { kind: "deref" }> {
  const pointer = analyzeExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
  const aggregatePointee = getAggregatePointerPointee(pointer.type as SemanticPointerType, functionName, sourceText, file);
  const field = getAggregateFieldLayout(
    toSemanticType({ kind: "aggregate", aggregateKind: aggregatePointee.aggregateKind, name: aggregatePointee.name }) as SemanticAggregateType,
    fieldName,
    functionName,
    sourceText,
    file,
  );
  if (field.type.kind !== "array") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports array field access on ${aggregatePointee.aggregateKind} ${aggregatePointee.name}->${fieldName} in ${functionName}().`, { file, offset: 0 });
  }
  const boundIndex = analyzeExpr(index, scope, functionSymbols, functionName, sourceText, file);
  if (field.type.length !== undefined) {
    assertArrayIndexInBounds(boundIndex, `${aggregatePointee.name}.${fieldName}`, field.type.length, functionName, sourceText, file);
  }
  return {
    kind: "deref",
    pointer: {
      kind: "pointerAdd",
      pointer: {
        kind: "pointerAdd",
        pointer,
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: "char",
        type: toSemanticPointerType("char"),
      },
      index: boundIndex,
      pointee: field.type.elementType,
      type: toSemanticPointerType(field.type.elementType),
    },
    type: toSemanticScalarType(field.type.elementType),
  };
}

function analyzePointerAggregateArrayFieldAssignExpr(
  name: string,
  fieldName: string,
  index: SourceExpr,
  expr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): Extract<BoundExpr, { kind: "derefAssign" }> {
  const target = analyzePointerAggregateArrayFieldIndexExpr(name, fieldName, index, scope, functionSymbols, functionName, sourceText, file);
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
  const aggregatePointee = getAggregatePointerPointee(pointer.type as SemanticPointerType, functionName, sourceText, file);
  const field = getAssignableAggregateFieldLayout(
    toSemanticType({
      kind: "aggregate",
      aggregateKind: aggregatePointee.aggregateKind,
      name: aggregatePointee.name,
    }) as SemanticAggregateType,
    fieldName,
    functionName,
    sourceText,
    file,
  );
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
    type: field.type,
  };
}

function getAggregateStorageAddress(
  symbol: BoundLocalSymbol | BoundGlobalSymbol,
  type: SemanticAggregateType,
): Extract<BoundExpr, { kind: "localAddress" | "globalAddress" }> {
  const pointerType = toSemanticPointerType({
    kind: "aggregate",
    aggregateKind: type.aggregateKind,
    name: type.name,
  });
  return symbol.kind === "global"
    ? { kind: "globalAddress", symbol, type: pointerType }
    : { kind: "localAddress", symbol, type: pointerType };
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
  if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate field access on local/global struct/union objects, got '${name}.${fieldName}'.`, {
      file,
      offset: 0,
    });
  }
  const field = getScalarAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file);
  return {
    pointer: {
      kind: "pointerAdd",
      pointer: getAggregateStorageAddress(symbol, symbol.type),
      index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
      pointee: "char",
      type: toSemanticPointerType("char"),
    },
    type: field.type,
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
    type: field.type,
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
  if (targetExpr.kind === "arrayPointerElement" || targetExpr.kind === "arrayIndex") {
    const target = getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    const field = getScalarAggregateFieldLayout(target.type, fieldName, functionName, sourceText, file);
    return {
      pointer: { kind: "pointerAdd", pointer: target.pointer, index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") }, pointee: "char", type: toSemanticPointerType("char") },
      type: field.type,
    };
  }
  if (
    targetExpr.kind === "memberAccess"
    || targetExpr.kind === "memberExprAccess"
    || targetExpr.kind === "pointerMemberAccess"
    || targetExpr.kind === "pointerMemberExprAccess"
  ) {
    const target = getAggregateObjectPointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    const field = getScalarAggregateFieldLayout(target.type, fieldName, functionName, sourceText, file);
    return {
      pointer: {
        kind: "pointerAdd",
        pointer: target.pointer,
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: "char",
        type: toSemanticPointerType("char"),
      },
      type: field.type,
    };
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
      type: field.type,
    };
  }
  if (targetExpr.kind === "ref") {
    return analyzeAggregateFieldPointer(targetExpr.name, fieldName, scope, functionName, sourceText, file);
  }
  throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '.' on local aggregates or dereferenced struct/union pointers in ${functionName}().`, {
    file,
    offset: 0,
  });
}

function getAggregateFieldAssignablePointerFromTargetExpr(
  targetExpr: SourceExpr,
  fieldName: string,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): { pointer: BoundExpr; type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType } {
  if (targetExpr.kind === "arrayPointerElement" || targetExpr.kind === "arrayIndex") {
    const target = getAggregateBasePointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    const field = getAssignableAggregateFieldLayout(target.type, fieldName, functionName, sourceText, file);
    return {
      pointer: {
        kind: "pointerAdd",
        pointer: target.pointer,
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: "char",
        type: toSemanticPointerType("char"),
      },
      type: field.type,
    };
  }
  if (
    targetExpr.kind === "memberAccess"
    || targetExpr.kind === "memberExprAccess"
    || targetExpr.kind === "pointerMemberAccess"
    || targetExpr.kind === "pointerMemberExprAccess"
  ) {
    const target = getAggregateObjectPointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
    const field = getAssignableAggregateFieldLayout(target.type, fieldName, functionName, sourceText, file);
    return {
      pointer: {
        kind: "pointerAdd",
        pointer: target.pointer,
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: "char",
        type: toSemanticPointerType("char"),
      },
      type: field.type,
    };
  }
  if (targetExpr.kind === "deref") {
    const pointer = analyzeExpr(targetExpr.expr, scope, functionSymbols, functionName, sourceText, file);
    if (pointer.type.kind !== "pointer" || typeof pointer.type.pointee === "string") {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '.' on dereferenced struct/union pointers in ${functionName}().`, {
        file,
        offset: 0,
      });
    }
    const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
    const field = getAssignableAggregateFieldLayout(
      toSemanticType({
        kind: "aggregate",
        aggregateKind: aggregatePointee.aggregateKind,
        name: aggregatePointee.name,
      }) as SemanticAggregateType,
      fieldName,
      functionName,
      sourceText,
      file,
    );
    return {
      pointer: {
        kind: "pointerAdd",
        pointer,
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: "char",
        type: toSemanticPointerType("char"),
      },
      type: field.type,
    };
  }
  if (targetExpr.kind === "ref") {
    const symbol = lookupVisible(scope, targetExpr.name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports aggregate field assignment on local/global struct/union objects, got '${targetExpr.name}.${fieldName}'.`, {
        file,
        offset: 0,
      });
    }
    const field = getAssignableAggregateFieldLayout(symbol.type, fieldName, functionName, sourceText, file);
    return {
      pointer: {
        kind: "pointerAdd",
        pointer: getAggregateStorageAddress(symbol, symbol.type),
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: "char",
        type: toSemanticPointerType("char"),
      },
      type: field.type,
    };
  }
  throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '.' assignment on local aggregates or dereferenced struct/union pointers in ${functionName}().`, {
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
): { kind: "pointer"; pointer: BoundExpr; type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType } | { kind: "value"; expr: BoundExpr } {
  if (isAggregateStorageExpr(targetExpr)) {
    const target = getAggregateFieldPointerFromTargetExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file);
    return {
      kind: "pointer",
      pointer: target.pointer,
      type: target.type,
    };
  }
  return {
    kind: "value",
    expr: analyzeAggregateProducerFieldReadExpr(targetExpr, fieldName, scope, functionSymbols, functionName, sourceText, file),
  };
}

function analyzeAggregateProducerFieldReadExpr(
  targetExpr: SourceExpr,
  fieldName: string,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundExpr {
  const target = resolveAggregateProducerFieldTarget(targetExpr, scope, functionSymbols, functionName, sourceText, file);
  return lowerAggregateProducerFieldReadExpr(target.source, fieldName, functionName, sourceText, file, target.offset, target.type);
}

function lowerAggregateProducerFieldReadExpr(
  expr: BoundAggregateValueExpr,
  fieldName: string,
  functionName: string,
  sourceText: string,
  file?: string,
  baseOffset = 0,
  aggregateType = expr.type,
): BoundExpr {
  const field = getReadableAggregateFieldLayout(aggregateType, fieldName, functionName, sourceText, file);
  return {
    kind: "aggregateProducerFieldRead",
    source: expr,
    offset: baseOffset + field.offset,
    type: field.type,
  };
}

function analyzeForInitializer(
  init: SourceForInit,
  scope: Scope,
  allLocals: Map<string, BoundLocalSymbol>,
  localList: BoundLocalSymbol[],
  globals: BoundGlobalSymbol[],
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
  if (init.isStatic) {
    if (init.initializer && !isStaticStorageInitializer(init.initializer)) {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter C Subset requires a static-data initializer for static local '${init.name}' in ${functionName}().`, {
        file,
        offset: 0,
      });
    }
    const symbol: BoundGlobalSymbol = {
      kind: "global",
      name: `__scc_static_${functionName}_${globals.length}`,
      type: toSemanticType(init.type),
      initializer: init.initializer,
    };
    globals.push(symbol);
    scope.entries.set(init.name, symbol);
    return { kind: "staticDecl" };
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
      ? init.initializer.kind === "expr"
        ? symbol.type.kind === "aggregate"
          ? analyzeAggregateProducerExpr(init.initializer.expr, scope, functionSymbols, symbol.type, functionName, sourceText, file)
          : analyzeExpr(init.initializer.expr, scope, functionSymbols, functionName, sourceText, file)
        : undefined
      : undefined,
    initStatements: init.initStatements?.map((stmt) => analyzeSimpleStmt(stmt, scope, functionSymbols, functionName, sourceText, file)),
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
      if (!symbol) {
        const functionSymbol = functionSymbols.get(expr.name);
        if (functionSymbol) {
          return {
            kind: "functionAddress",
            name: functionSymbol.name,
            type: toSemanticFunctionPointerType(functionSymbol),
          };
        }
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports address-of on local/global symbols or functions, got '${expr.name}'.`, {
          file,
          offset: 0,
        });
      }
      if (symbol.kind !== "local" && symbol.kind !== "global") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports address-of on local/global symbols or functions, got '${expr.name}'.`, {
          file,
          offset: 0,
        });
      }
      if (symbol.kind === "global") {
        if (symbol.type.kind === "array") {
          return { kind: "globalAddress", symbol, type: toSemanticPointerType(getArrayDecayPointee(symbol.type)) };
        }
        return { kind: "globalAddress", symbol, type: toSemanticPointerType(toPointerPointee(symbol.type)) };
      }
      if (symbol.type.kind === "array") {
        return { kind: "localAddress", symbol, type: toSemanticPointerType(getArrayDecayPointee(symbol.type)) };
      }
      return { kind: "localAddress", symbol, type: toSemanticPointerType(toPointerPointee(symbol.type)) };
    }
    case "addressOfExpr": {
      if (expr.expr.kind === "arrayPointerElement") {
        return getAggregateBasePointerFromExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file).pointer;
      }
      if (expr.expr.kind === "arrayIndex") {
        const symbol = lookupVisible(scope, expr.expr.name);
        if (symbol && symbol.kind !== "function" && symbol.type.kind === "array" && symbol.type.elementValueType?.kind === "aggregate") {
          return getAggregateBasePointerFromExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file).pointer;
        }
      }
      if (isAggregateFieldAccessExpr(expr.expr)) {
        const arrayFieldAddress = getArrayFieldAddressFromConsumerExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file);
        if (arrayFieldAddress) {
          return arrayFieldAddress;
        }
      }
      const target = analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file);
      if (isAggregateFieldAccessExpr(expr.expr) && target.type.kind === "pointer" && target.kind !== "deref") {
        return target;
      }
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
          pointer: target.symbol.kind === "param"
            ? {
              kind: "ref",
              symbol: target.symbol,
              type: toSemanticPointerType({
                kind: "aggregate",
                aggregateKind: aggregateType.aggregateKind,
                name: aggregateType.name,
              }),
            }
            : getAggregateStorageAddress(target.symbol, aggregateType),
          index: { kind: "const", value: target.offset, type: toSemanticScalarType("int") },
          pointee: "char",
          type: toSemanticPointerType(target.type.name),
        };
      }
      if (target.kind === "aggregateProducerFieldRead") {
        return {
          kind: "aggregateProducerFieldAddress",
          source: target.source,
          offset: target.offset,
          type: toSemanticPointerType(toPointerPointee(target.type)),
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
      if (!symbol) {
        const functionSymbol = functionSymbols.get(expr.name);
        if (functionSymbol) {
          return {
            kind: "functionAddress",
            name: functionSymbol.name,
            type: toSemanticFunctionPointerType(functionSymbol),
          };
        }
      }
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global")) {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not know symbol '${expr.name}'.`, {
          file,
          offset: 0,
        });
      }
      if (symbol.kind === "global") {
        if (symbol.type.kind === "array") {
          return { kind: "globalAddress", symbol, type: toSemanticPointerType(getArrayDecayPointee(symbol.type)) };
        }
        if (symbol.type.kind === "aggregate") {
          throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not yet support aggregate object values for '${expr.name}' in ${functionName}().`, {
            file,
            offset: 0,
          });
        }
        if (symbol.type.kind === "functionPointer") {
          return { kind: "globalRef", symbol, type: symbol.type };
        }
        return { kind: "globalRef", symbol, type: getValueSemanticType(symbol.type) };
      }
      if (symbol.kind === "local" && symbol.type.kind === "array") {
        return { kind: "localAddress", symbol, type: toSemanticPointerType(getArrayDecayPointee(symbol.type)) };
      }
      if (symbol.kind === "param" && symbol.type.kind === "array") {
        return { kind: "ref", symbol, type: toSemanticPointerType(getArrayDecayPointee(symbol.type)) };
      }
      if (symbol.type.kind === "aggregate") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not yet support aggregate object values for '${expr.name}' in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      if (symbol.type.kind === "functionPointer") {
        return { kind: "ref", symbol, type: symbol.type };
      }
      return { kind: "ref", symbol, type: getValueSemanticType(symbol.type) };
    }
    case "memberAccess": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports member access on local/parameter/global struct/union objects, got '${expr.name}.${expr.field}'.`, {
          file,
          offset: 0,
        });
      }
      const rawField = getAggregateFieldLayout(symbol.type, expr.field, functionName, sourceText, file);
      if (rawField.type.kind === "array") {
        return analyzeExpr(
          { kind: "addressOfExpr", expr: { kind: "memberArrayIndex", name: expr.name, field: expr.field, index: { kind: "const", value: 0 } } },
          scope,
          functionSymbols,
          functionName,
          sourceText,
          file,
        );
      }
      const field = getReadableAggregateFieldLayout(symbol.type, expr.field, functionName, sourceText, file);
      if (field.type.kind === "scalar") {
        return {
          kind: "aggregateFieldAccess",
          symbol,
          offset: field.offset,
          type: field.type,
        };
      }
      return {
        kind: "deref",
        pointer: {
          kind: "pointerAdd",
          pointer: symbol.kind === "param"
            ? {
              kind: "ref",
              symbol,
              type: toSemanticPointerType({
                kind: "aggregate",
                aggregateKind: symbol.type.aggregateKind,
                name: symbol.type.name,
              }),
            }
            : getAggregateStorageAddress(symbol, symbol.type),
          index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
          pointee: "char",
          type: toSemanticPointerType("char"),
        },
        type: field.type,
      };
    }
    case "memberArrayIndex": {
      return analyzeAggregateArrayFieldIndexExpr(expr.name, expr.field, expr.index, scope, functionSymbols, functionName, sourceText, file);
    }
    case "memberExprArrayIndex": {
      return analyzeAggregateArrayFieldIndexExprTarget(expr.target, expr.field, expr.index, scope, functionSymbols, functionName, sourceText, file);
    }
    case "memberExprAccess": {
      if (getAggregateFieldLayoutForConsumerTarget(expr.target, expr.field, scope, functionSymbols, functionName, sourceText, file).type.kind === "array") {
        return analyzeExpr(
          { kind: "addressOfExpr", expr: { kind: "memberExprArrayIndex", target: expr.target, field: expr.field, index: { kind: "const", value: 0 } } },
          scope,
          functionSymbols,
          functionName,
          sourceText,
          file,
        );
      }
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
    case "pointerMemberArrayIndex": {
      return analyzePointerAggregateArrayFieldIndexExpr(expr.name, expr.field, expr.index, scope, functionSymbols, functionName, sourceText, file);
    }
    case "pointerMemberExprArrayIndex": {
      return analyzePointerAggregateArrayFieldIndexExprTarget(expr.target, expr.field, expr.index, scope, functionSymbols, functionName, sourceText, file);
    }
    case "pointerMemberAccess": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "pointer") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers, got '${expr.name}->${expr.field}' in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      const aggregatePointee = getAggregatePointerPointee(symbol.type, functionName, sourceText, file);
      const aggregateType = toSemanticType({
          kind: "aggregate",
          aggregateKind: aggregatePointee.aggregateKind,
          name: aggregatePointee.name,
        }) as SemanticAggregateType;
      const rawField = getAggregateFieldLayout(aggregateType, expr.field, functionName, sourceText, file);
      if (rawField.type.kind === "array") {
        return analyzeExpr(
          { kind: "addressOfExpr", expr: { kind: "pointerMemberArrayIndex", name: expr.name, field: expr.field, index: { kind: "const", value: 0 } } },
          scope,
          functionSymbols,
          functionName,
          sourceText,
          file,
        );
      }
      const field = getReadableAggregateFieldLayout(aggregateType, expr.field, functionName, sourceText, file);
      return {
        kind: "deref",
        pointer: {
          kind: "pointerAdd",
          pointer: symbol.kind === "global"
            ? { kind: "globalRef", symbol, type: symbol.type }
            : { kind: "ref", symbol, type: symbol.type },
          index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
          pointee: "char",
          type: toSemanticPointerType("char"),
        },
        type: field.type,
      };
    }
    case "pointerMemberExprAccess": {
      const pointer = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
      const aggregatePointee = getAggregatePointerPointee(pointer.type as SemanticPointerType, functionName, sourceText, file);
      const aggregateType = toSemanticType({
        kind: "aggregate",
        aggregateKind: aggregatePointee.aggregateKind,
        name: aggregatePointee.name,
      }) as SemanticAggregateType;
      const rawField = getAggregateFieldLayout(aggregateType, expr.field, functionName, sourceText, file);
      if (rawField.type.kind === "array") {
        return analyzeExpr(
          { kind: "addressOfExpr", expr: { kind: "pointerMemberExprArrayIndex", target: expr.target, field: expr.field, index: { kind: "const", value: 0 } } },
          scope,
          functionSymbols,
          functionName,
          sourceText,
          file,
        );
      }
      const field = getReadableAggregateFieldLayout(
        aggregateType,
        expr.field,
        functionName,
        sourceText,
        file,
      );
      return {
        kind: "deref",
        pointer: {
          kind: "pointerAdd",
          pointer,
          index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
          pointee: "char",
          type: toSemanticPointerType("char"),
        },
        type: field.type,
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
      return {
        kind: "deref",
        pointer,
        type: getPointerPointeeValueType(pointer.type, functionName, sourceText, file),
      };
    }
    case "arrayIndex": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global")) {
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
            pointer: symbol.kind === "global"
              ? { kind: "globalRef", symbol, type: symbol.type }
              : { kind: "ref", symbol, type: symbol.type },
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
      if (symbol.type.elementValueType) {
        if (symbol.type.elementValueType.kind === "aggregate") {
          throwDiagnostic(sourceText, `TsSccCompilerAdapter C Subset only supports aggregate array elements as aggregate consumers in ${functionName}().`, { file, offset: 0 });
        }
        const elementPointee = toArrayElementPointee(symbol.type);
        return {
          kind: "deref",
          pointer: {
            kind: "pointerAdd",
            pointer: symbol.kind === "global"
              ? { kind: "globalAddress", symbol, type: toSemanticPointerType(elementPointee) }
              : symbol.kind === "local"
                ? { kind: "localAddress", symbol, type: toSemanticPointerType(elementPointee) }
                : { kind: "ref", symbol, type: toSemanticPointerType(elementPointee) },
            index,
            pointee: elementPointee,
            type: toSemanticPointerType(elementPointee),
          },
          type: getArrayElementValueType(symbol.type),
        };
      }
      if (symbol.kind === "global") {
        return {
          kind: "globalArrayElement",
          symbol,
          index,
          type: toSemanticScalarType(symbol.type.elementType),
        };
      }
      if (symbol.kind === "param") {
        return {
          kind: "paramArrayElement",
          symbol,
          index,
          type: toSemanticScalarType(symbol.type.elementType),
        };
      }
      assertArrayIndexInBounds(index, expr.name, getSizedArrayLength(symbol.type), functionName, sourceText, file);
      return {
        kind: "localArrayElement",
        symbol,
        index,
        type: toSemanticScalarType(symbol.type.elementType),
      };
    }
    case "arrayPointerElement": {
      const pointer = analyzeExpr(expr.pointer, scope, functionSymbols, functionName, sourceText, file);
      if (pointer.type.kind !== "pointer" || typeof pointer.type.pointee === "string" || pointer.type.pointee.kind !== "arrayPointer") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports (*pointer-to-array)[index] in ${functionName}().`, { file, offset: 0 });
      }
      if (pointer.type.pointee.elementValueType?.kind === "aggregate") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter C Subset only supports aggregate array elements as aggregate consumers in ${functionName}().`, { file, offset: 0 });
      }
      const elementPointee = pointer.type.pointee.elementValueType ?? pointer.type.pointee.elementType;
      return {
        kind: "deref",
        pointer: {
          kind: "pointerAdd",
          pointer,
          index: analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file),
          pointee: elementPointee,
          type: toSemanticPointerType(elementPointee),
        },
        type: getArrayPointerElementValueType(pointer.type.pointee),
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
      if (!target) {
        const symbol = lookupVisible(scope, expr.target);
        if (symbol && (symbol.kind === "local" || symbol.kind === "param" || symbol.kind === "global") && symbol.type.kind === "functionPointer") {
          const signature = symbol.type;
          if (symbol.type.params.length !== expr.args.length) {
            throwDiagnostic(
              sourceText,
              `TsSccCompilerAdapter Phase C subset expected ${symbol.type.params.length} argument(s) for indirect call '${expr.target}()', got ${expr.args.length}.`,
              { file, offset: 0 },
            );
          }
          return {
            kind: "indirectCall",
            target: symbol.kind === "global"
              ? { kind: "globalRef", symbol, type: symbol.type }
              : { kind: "ref", symbol, type: symbol.type },
            signature,
            args: expr.args.map((arg, index) => analyzeCallArg(arg, signature.params[index], scope, functionSymbols, functionName, sourceText, file)),
            type: signature.returnType.kind === "void"
              ? toSemanticScalarType("int")
              : (signature.returnType as SemanticScalarType | SemanticPointerType),
          };
        }
      }
      return {
        kind: "call",
        target: target ?? { kind: "extern", name: expr.target },
        args: expr.args.map((arg, index) => analyzeCallArg(arg, target?.params[index], scope, functionSymbols, functionName, sourceText, file)),
        type: !target || target.returnType.kind === "void"
          ? toSemanticScalarType("int")
          : (target.returnType as SemanticScalarType | SemanticPointerType),
      };
    }
    case "indirectCall": {
      const target = analyzeExpr(expr.target, scope, functionSymbols, functionName, sourceText, file);
      if (target.type.kind !== "functionPointer") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports indirect call through function pointers in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      const signature = target.type;
      if (target.type.params.length !== expr.args.length) {
        throwDiagnostic(
          sourceText,
          `TsSccCompilerAdapter Phase C subset expected ${target.type.params.length} argument(s) for indirect call, got ${expr.args.length}.`,
          { file, offset: 0 },
        );
      }
      return {
        kind: "indirectCall",
        target,
        signature,
        args: expr.args.map((arg, index) => analyzeCallArg(arg, signature.params[index], scope, functionSymbols, functionName, sourceText, file)),
        type: signature.returnType.kind === "void"
          ? toSemanticScalarType("int")
          : (signature.returnType as SemanticScalarType | SemanticPointerType),
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
      if (symbol.type.kind === "functionPointer") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support increment/decrement on function pointers in ${functionName}().`, {
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
      if (symbol.type.elementType === "int") {
        return {
          kind: "derefIncDec",
          pointer: makeArrayElementPointer(symbol, boundIndex),
          op: expr.op,
          mode: expr.kind === "preArrayIncDec" ? "prefix" : "postfix",
          type: toSemanticScalarType("int"),
        };
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
        type: field.type,
      };
    }
    case "assign": {
      const symbol = lookupVisible(scope, expr.name);
      if (!symbol || (symbol.kind !== "local" && symbol.kind !== "global") || symbol.type.kind === "array") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports assignment to local/global scalar or pointer symbols, got '${expr.name}'.`, {
          file,
          offset: 0,
        });
      }
      if (symbol.kind === "global") {
        return {
          kind: "assignGlobal",
          global: symbol,
          expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
          type: symbol.type.kind === "functionPointer" ? symbol.type : getValueSemanticType(symbol.type),
        };
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
      if (symbol && symbol.kind === "global" && symbol.type.kind === "array") {
        if (symbol.type.elementValueType) {
          if (symbol.type.elementValueType.kind === "aggregate") {
            throwDiagnostic(sourceText, `TsSccCompilerAdapter C Subset requires aggregate array assignments to be used as statements in ${functionName}().`, { file, offset: 0 });
          }
          const elementPointee = toArrayElementPointee(symbol.type);
          return {
            kind: "derefAssign",
            pointer: {
              kind: "pointerAdd",
              pointer: { kind: "globalAddress", symbol, type: toSemanticPointerType(elementPointee) },
              index: analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file),
              pointee: elementPointee,
              type: toSemanticPointerType(elementPointee),
            },
            expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
            type: getArrayElementValueType(symbol.type),
          };
        }
        return {
          kind: "globalArrayAssignExpr",
          target: symbol,
          index: analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file),
          expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
          type: toSemanticScalarType("char"),
        };
      }
      if (symbol && (symbol.kind === "local" || symbol.kind === "param") && symbol.type.kind === "array" && symbol.type.elementValueType) {
        if (symbol.type.elementValueType.kind === "aggregate") {
          throwDiagnostic(sourceText, `TsSccCompilerAdapter C Subset requires aggregate array assignments to be used as statements in ${functionName}().`, { file, offset: 0 });
        }
        const elementPointee = toArrayElementPointee(symbol.type);
        return {
          kind: "derefAssign",
          pointer: {
            kind: "pointerAdd",
            pointer: symbol.kind === "local"
              ? { kind: "localAddress", symbol, type: toSemanticPointerType(elementPointee) }
              : { kind: "ref", symbol, type: toSemanticPointerType(elementPointee) },
            index: analyzeExpr(expr.index, scope, functionSymbols, functionName, sourceText, file),
            pointee: elementPointee,
            type: toSemanticPointerType(elementPointee),
          },
          expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
          type: getArrayElementValueType(symbol.type),
        };
      }
      const stmt = analyzeArrayAssignStmt(expr.name, expr.index, expr.expr, scope, functionSymbols, functionName, sourceText, file);
      if (stmt.kind === "expr") {
        return stmt.expr;
      }
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
    case "memberArrayAssign":
      return analyzeAggregateArrayFieldAssignExprTarget(expr.target, expr.field, expr.index, expr.expr, scope, functionSymbols, functionName, sourceText, file);
    case "pointerMemberArrayAssign":
      return analyzePointerAggregateArrayFieldAssignExpr(expr.name, expr.field, expr.index, expr.expr, scope, functionSymbols, functionName, sourceText, file);
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
      return {
        kind: "derefAssign",
        pointer,
        expr: analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file),
        type: getPointerPointeeValueType(pointer.type, functionName, sourceText, file),
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
    case "cast": {
      const targetType = toSemanticType(expr.type);
      if (targetType.kind !== "scalar" && targetType.kind !== "pointer") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar/pointer casts in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
      const source = analyzeExpr(expr.expr, scope, functionSymbols, functionName, sourceText, file);
      if (targetType.kind === "pointer") {
        if (source.type.kind !== "pointer" && source.type.kind !== "scalar") {
          throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar/pointer casts in ${functionName}().`, {
            file,
            offset: 0,
          });
        }
        return { kind: "cast", expr: source, type: targetType };
      }
      if (source.kind === "const") {
        return {
          kind: "const",
          value: targetType.width === 1 ? (source.value & 0xFF) : (source.value & 0xFFFF),
          type: targetType,
        };
      }
      return {
        kind: "cast",
        expr: source,
        type: targetType,
      };
    }
    case "comma": {
      const left = analyzeExpr(expr.left, scope, functionSymbols, functionName, sourceText, file);
      const right = analyzeExpr(expr.right, scope, functionSymbols, functionName, sourceText, file);
      if (right.type.kind === "functionPointer") {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support comma expressions yielding function pointers in ${functionName}().`, {
          file,
          offset: 0,
        });
      }
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
            pointee: left.type.pointee,
            type: left.type,
          };
        }
        if (left.type.kind === "scalar" && right.type.kind === "pointer" && expr.op === "+") {
          return {
            kind: "pointerAdd",
            pointer: right,
            index: left,
            pointee: right.type.pointee,
            type: right.type,
          };
        }
        if (left.type.kind === "pointer" && right.type.kind === "pointer" && expr.op === "-") {
          if (!samePointerType(left.type, right.type)) {
            throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset requires compatible pointer types for subtraction in ${functionName}().`, {
              file,
              offset: 0,
            });
          }
          const byteDifference: BoundExpr = {
            kind: "additive",
            left,
            right,
            op: "-",
            type: toSemanticScalarType("int"),
          };
          const stride = getPointerPointeeStride(left.type.pointee);
          if (stride === 1) {
            return byteDifference;
          }
          const shift = Math.log2(stride);
          if (Number.isInteger(shift)) {
            return {
              kind: "shift",
              left: byteDifference,
              right: { kind: "const", value: shift, type: toSemanticScalarType("int") },
              op: ">>",
              type: toSemanticScalarType("int"),
            };
          }
          return {
            kind: "multiplicative",
            left: byteDifference,
            right: { kind: "const", value: stride, type: toSemanticScalarType("int") },
            op: "/",
            type: toSemanticScalarType("int"),
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

function isAggregateFieldAccessExpr(
  expr: SourceExpr,
): expr is Extract<SourceExpr, { kind: "memberAccess" | "memberExprAccess" | "pointerMemberAccess" | "pointerMemberExprAccess" }> {
  switch (expr.kind) {
    case "memberAccess":
    case "memberExprAccess":
    case "pointerMemberAccess":
    case "pointerMemberExprAccess":
      return true;
    default:
      return false;
  }
}

function analyzeCallArg(
  arg: SourceExpr,
  paramType: SemanticType | undefined,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): BoundCallArg {
  if (paramType?.kind === "aggregate") {
    return analyzeAggregateProducerExpr(arg, scope, functionSymbols, paramType, functionName, sourceText, file);
  }
  return analyzeExpr(arg, scope, functionSymbols, functionName, sourceText, file);
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
  if (type.kind === "void") {
    return type;
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
  if (type.kind === "functionPointer") {
    return {
      kind: "functionPointer",
      returnType: toSemanticType(type.returnType),
      params: type.params.map((param) => toSemanticType(param)),
      width: 2,
    };
  }
  return {
    kind: "array",
    elementType: type.elementType,
    elementValueType: type.elementValueType ? toSemanticType(type.elementValueType) as SemanticAggregateType | SemanticPointerType | SemanticFunctionPointerType : undefined,
    dimensions: type.dimensions,
    length: type.length,
  };
}

function toSemanticFunctionPointerType(fn: BoundFunctionSymbol): SemanticFunctionPointerType {
  return {
    kind: "functionPointer",
    returnType: fn.returnType,
    params: fn.params,
    width: 2,
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

function toPointerPointee(type: SemanticType): PointerPointee {
  switch (type.kind) {
    case "void":
      throw new Error(`Expected non-void type for pointer pointee conversion, got ${JSON.stringify(type)}`);
    case "scalar":
      return type.name;
    case "aggregate":
      return {
        kind: "aggregate",
        aggregateKind: type.aggregateKind,
        name: type.name,
      };
    case "pointer":
      return {
        kind: "pointer",
        pointee: type.pointee,
      };
    case "functionPointer":
      return type;
    case "array":
      throw new Error(`Expected non-array type for pointer pointee conversion, got ${JSON.stringify(type)}`);
    default:
      return assertNever(type);
  }
}

function getTypeStorageBytes(type: SourceType): number {
  if (type.kind === "void") {
    throw new Error("Void type has no storage bytes.");
  }
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
  if (type.kind === "functionPointer") {
    return 2;
  }
  if (type.length === undefined) {
    throw new Error(`Unsized arrays are only supported for parameters, got ${JSON.stringify(type)}`);
  }
  return getArrayStorageBytes(type);
}

function getArrayDecayPointee(type: SemanticArrayType): PointerPointee {
  const rowLength = type.dimensions?.[0];
  return rowLength === undefined
    ? toArrayElementPointee(type)
    : {
      kind: "arrayPointer",
      elementType: type.elementType,
      ...(type.elementValueType ? { elementValueType: toArrayElementPointee(type) as Exclude<PointerPointee, ScalarType> } : {}),
      length: rowLength,
    };
}

function toArrayElementPointee(type: SemanticArrayType): PointerPointee {
  if (!type.elementValueType) {
    return type.elementType;
  }
  if (type.elementValueType.kind === "aggregate") {
    return { kind: "aggregate", aggregateKind: type.elementValueType.aggregateKind, name: type.elementValueType.name };
  }
  if (type.elementValueType.kind === "pointer") {
    return { kind: "pointer", pointee: type.elementValueType.pointee };
  }
  return type.elementValueType as import("./tsFrontendAst").FunctionPointerTypeRef;
}

function getArrayElementValueType(type: SemanticArrayType): SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType {
  if (!type.elementValueType) {
    return toSemanticScalarType(type.elementType);
  }
  if (type.elementValueType.kind === "aggregate") {
    throw new Error("Aggregate array elements are consumed through aggregateAddress.");
  }
  return type.elementValueType;
}

function getArrayPointerElementValueType(type: import("./tsFrontendAst").ArrayPointerTypeRef): SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType {
  if (!type.elementValueType) {
    return toSemanticScalarType(type.elementType);
  }
  if (type.elementValueType.kind === "aggregate") {
    throw new Error("Aggregate array elements are consumed through aggregateAddress.");
  }
  if (type.elementValueType.kind === "arrayPointer") {
    return toSemanticPointerType(type.elementValueType);
  }
  return toSemanticType(type.elementValueType) as SemanticPointerType | SemanticFunctionPointerType;
}

function getArrayStorageBytes(type: SemanticArrayType | Extract<SourceType, { kind: "array" }>): number {
  if (type.length === undefined) {
    throw new Error(`Unsized arrays are only supported for parameters, got ${JSON.stringify(type)}`);
  }
  return [type.length, ...(type.dimensions ?? [])].reduce(
    (bytes, length) => bytes * length,
    getArrayElementStorageBytes(type),
  );
}

function getArrayElementStorageBytes(type: SemanticArrayType | Extract<SourceType, { kind: "array" }>): number {
  if (!type.elementValueType) {
    return type.elementType === "char" ? 1 : 2;
  }
  if (type.elementValueType.kind === "aggregate") {
    return "size" in type.elementValueType
      ? type.elementValueType.size
      : getTypeStorageBytes(type.elementValueType);
  }
  return 2;
}

function getBoundExprStorageBytes(expr: BoundExpr): number {
  switch (expr.kind) {
    case "const":
    case "string":
    case "ref":
    case "functionAddress":
    case "call":
    case "indirectCall":
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
    case "aggregateProducerFieldRead":
    case "aggregateProducerFieldAddress":
    case "pointerAdd":
    case "arrayElementAddress":
    case "deref":
    case "derefAssign":
    case "derefIncDec":
      return expr.type.width;
    case "localArrayElement":
    case "paramArrayElement":
    case "globalArrayElement":
    case "preArrayIncDec":
    case "postArrayIncDec":
    case "arrayAssignExpr":
    case "globalArrayAssignExpr":
    case "cast":
    case "comma":
    case "globalRef":
    case "globalAddress":
    case "assignGlobal":
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
      ? (symbol.type.length ?? 2) * (symbol.type.elementType === "char" ? 1 : 2)
      : symbol.type.kind === "aggregate"
        ? symbol.type.size
        : symbol.type.kind === "void"
          ? (() => {
            throw new Error(`Void expressions have no storage bytes: ${JSON.stringify(symbol.type)}`);
          })()
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
  if (type.kind === "void" || type.kind === "array" || type.kind === "aggregate" || type.kind === "functionPointer") {
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
  return samePointerPointee(left.pointee, right.pointee);
}

function samePointerPointee(left: PointerPointee, right: PointerPointee): boolean {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }
  if (left.kind === "aggregate" || right.kind === "aggregate") {
    return left.kind === "aggregate"
      && right.kind === "aggregate"
      && left.aggregateKind === right.aggregateKind
      && left.name === right.name;
  }
  if (left.kind === "arrayPointer" || right.kind === "arrayPointer") {
    return left.kind === "arrayPointer"
      && right.kind === "arrayPointer"
      && left.elementType === right.elementType
      && sameArrayPointerElementType(left.elementValueType, right.elementValueType)
      && left.length === right.length;
  }
  if (left.kind === "functionPointer" || right.kind === "functionPointer") {
    return left.kind === "functionPointer" && right.kind === "functionPointer";
  }
  return samePointerPointee(left.pointee, right.pointee);
}

function isZeroConstantExpr(expr: BoundExpr): boolean {
  return expr.kind === "const" && expr.value === 0;
}

function getPointerPointeeStride(pointee: PointerPointee): number {
  if (typeof pointee === "string") {
    return pointee === "char" ? 1 : 2;
  }
  if (pointee.kind === "arrayPointer") {
    return getArrayPointerElementStorageBytes(pointee) * pointee.length;
  }
  if (pointee.kind === "aggregate") {
    const layout = currentAggregateLayouts.get(`${pointee.aggregateKind}:${pointee.name}`);
    if (!layout) {
      throw new Error(`Unknown aggregate pointer-difference pointee '${pointee.aggregateKind} ${pointee.name}'.`);
    }
    return layout.size;
  }
  if (pointee.kind === "pointer" || pointee.kind === "functionPointer") {
    return 2;
  }
  throw new Error(`Pointer difference requires a sized scalar, array, or pointer pointee, got ${JSON.stringify(pointee)}.`);
}

function sameArrayPointerElementType(left?: import("./tsFrontendAst").ArrayPointerTypeRef["elementValueType"], right?: import("./tsFrontendAst").ArrayPointerTypeRef["elementValueType"]): boolean {
  if (!left || !right) {
    return left === right;
  }
  return samePointerPointee(left, right);
}

function getArrayPointerElementStorageBytes(type: import("./tsFrontendAst").ArrayPointerTypeRef): number {
  if (!type.elementValueType) {
    return type.elementType === "char" ? 1 : 2;
  }
  if (type.elementValueType.kind === "aggregate") {
    const layout = currentAggregateLayouts.get(`${type.elementValueType.aggregateKind}:${type.elementValueType.name}`);
    if (!layout) {
      throw new Error(`Unknown aggregate pointer-to-array element '${type.elementValueType.aggregateKind} ${type.elementValueType.name}'.`);
    }
    return layout.size;
  }
  return 2;
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
    `TsSccCompilerAdapter Phase C subset does not yet support ${formatPointerPointee(type.pointee)} pointee layout operations in ${functionName}().`,
    { file, offset: 0 },
  );
}

function getPointerPointeeValueType(
  type: SemanticPointerType,
  functionName: string,
  sourceText: string,
  file?: string,
): SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType {
  if (typeof type.pointee === "string") {
    return toSemanticScalarType(type.pointee);
  }
  if (type.pointee.kind === "pointer") {
    return {
      kind: "pointer",
      pointee: type.pointee.pointee,
      width: 2,
    };
  }
  if (type.pointee.kind === "arrayPointer") {
    return toSemanticPointerType(type.pointee);
  }
  if (type.pointee.kind === "functionPointer") {
    return toSemanticType(type.pointee) as SemanticFunctionPointerType;
  }
  throwDiagnostic(
    sourceText,
    `TsSccCompilerAdapter Phase C subset does not support aggregate dereference values in ${functionName}().`,
    { file, offset: 0 },
  );
}

function formatPointerPointee(type: Exclude<PointerPointee, ScalarType>): string {
  if (type.kind === "aggregate") {
    return `${type.aggregateKind} ${type.name}`;
  }
  if (type.kind === "arrayPointer") {
    return `${type.elementType}[${type.length}]`;
  }
  if (type.kind === "functionPointer") {
    return "function pointer";
  }
  return `${formatPointerPointee(type.pointee as Exclude<PointerPointee, ScalarType>)} *`;
}

function buildAggregateLayouts(
  defs: SourceAggregateDef[],
  sourceText: string,
  file?: string,
): Map<string, AggregateLayout> {
  const defsByKey = new Map<string, SourceAggregateDef>();
  const layouts = new Map<string, AggregateLayout>();
  for (const def of defs) {
    const key = `${def.aggregateKind}:${def.name}`;
    if (defsByKey.has(key)) {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate ${def.aggregateKind} tag '${def.name}'.`, {
        file,
        offset: 0,
      });
    }
    defsByKey.set(key, def);
  }

  const resolving = new Set<string>();

  const resolveFieldSize = (type: SourceType): number => {
    if (type.kind === "void") {
      throw new Error("Void type has no storage bytes.");
    }
    if (type.kind === "scalar") {
      return type.name === "char" ? 1 : 2;
    }
    if (type.kind === "pointer" || type.kind === "functionPointer") {
      return 2;
    }
    if (type.kind === "array") {
      if (type.length === undefined) {
        throw new Error(`Unsized arrays are only supported for parameters, got ${JSON.stringify(type)}`);
      }
      return getArrayStorageBytes(type);
    }
    return resolveLayout(`${type.aggregateKind}:${type.name}`).size;
  };

  const resolveLayout = (key: string): AggregateLayout => {
    const existing = layouts.get(key);
    if (existing) {
      return existing;
    }
    const def = defsByKey.get(key);
    if (!def) {
      const [aggregateKind, name] = key.split(":");
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not know ${aggregateKind} ${name} for aggregate layout.`, {
        file,
        offset: 0,
      });
    }
    if (resolving.has(key)) {
      const [aggregateKind, name] = key.split(":");
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support recursive ${aggregateKind} ${name} fields by value.`, {
        file,
        offset: 0,
      });
    }
    resolving.add(key);
    const fields = new Map<string, AggregateFieldLayout>();
    let runningOffset = 0;
    let maxFieldSize = 0;
    for (const field of def.fields) {
      if (fields.has(field.name)) {
        throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support duplicate field '${field.name}' in ${def.aggregateKind} ${def.name}.`, {
          file,
          offset: 0,
        });
      }
      const fieldSize = resolveFieldSize(field.type);
      fields.set(field.name, {
        offset: def.aggregateKind === "struct" ? runningOffset : 0,
        type: field.type,
        size: fieldSize,
      });
      if (def.aggregateKind === "struct") {
        runningOffset += fieldSize;
      } else if (fieldSize > maxFieldSize) {
        maxFieldSize = fieldSize;
      }
    }
    const layout: AggregateLayout = {
      kind: "aggregateLayout",
      aggregateKind: def.aggregateKind,
      name: def.name,
      size: def.aggregateKind === "struct" ? runningOffset : maxFieldSize,
      fields,
    };
    layouts.set(key, layout);
    resolving.delete(key);
    return layout;
  };

  for (const key of defsByKey.keys()) {
    resolveLayout(key);
  }

  return layouts;
}

function getAggregateFieldLayout(
  type: SemanticAggregateType,
  fieldName: string,
  functionName: string,
  sourceText: string,
  file?: string,
): AggregateFieldLayout {
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

function getScalarAggregateFieldLayout(
  type: SemanticAggregateType,
  fieldName: string,
  functionName: string,
  sourceText: string,
  file?: string,
): { offset: number; type: SemanticScalarType } {
  const field = getAggregateFieldLayout(type, fieldName, functionName, sourceText, file);
  if (field.type.kind !== "scalar") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar field access on ${type.aggregateKind} ${type.name}.${fieldName} in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  return {
    offset: field.offset,
    type: toSemanticScalarType(field.type.name),
  };
}

function getAssignableAggregateFieldLayout(
  type: SemanticAggregateType,
  fieldName: string,
  functionName: string,
  sourceText: string,
  file?: string,
): { offset: number; type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType } {
  const field = getAggregateFieldLayout(type, fieldName, functionName, sourceText, file);
  if (field.type.kind === "scalar") {
    return {
      offset: field.offset,
      type: toSemanticScalarType(field.type.name),
    };
  }
  if (field.type.kind === "pointer") {
    return {
      offset: field.offset,
      type: toSemanticPointerType(field.type.pointee),
    };
  }
  if (field.type.kind === "functionPointer") {
    return {
      offset: field.offset,
      type: {
        kind: "functionPointer",
        returnType: toSemanticType(field.type.returnType),
        params: field.type.params.map((param) => toSemanticType(param)),
        width: 2,
      },
    };
  }
  throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar/pointer/function-pointer field assignment on ${type.aggregateKind} ${type.name}.${fieldName} in ${functionName}().`, {
    file,
    offset: 0,
  });
}

function getReadableAggregateFieldLayout(
  type: SemanticAggregateType,
  fieldName: string,
  functionName: string,
  sourceText: string,
  file?: string,
): { offset: number; type: SemanticScalarType | SemanticPointerType | SemanticFunctionPointerType } {
  return getAssignableAggregateFieldLayout(type, fieldName, functionName, sourceText, file);
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
  field: { offset: number; type: SemanticScalarType };
} {
  const symbol = lookupVisible(scope, name);
  if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || symbol.type.kind !== "pointer") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers, got '${name}->${fieldName}' in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  const aggregatePointee = getAggregatePointerPointee(symbol.type, functionName, sourceText, file);
  const layout = currentAggregateLayouts.get(`${aggregatePointee.aggregateKind}:${aggregatePointee.name}`);
  if (!layout) {
    throw new Error(`Unknown aggregate type '${aggregatePointee.aggregateKind} ${aggregatePointee.name}'.`);
  }
  const field = layout.fields.get(fieldName);
  if (!field) {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not support unknown field '${fieldName}' on ${aggregatePointee.aggregateKind} ${aggregatePointee.name} in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  if (field.type.kind !== "scalar") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar field access on ${aggregatePointee.aggregateKind} ${aggregatePointee.name}->${fieldName} in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  return {
    symbol: symbol as (BoundLocalSymbol | BoundParamSymbol) & { type: SemanticPointerType },
    field: { offset: field.offset, type: toSemanticScalarType(field.type.name) },
  };
}

function getPointerAggregateFieldFromExpr(
  pointer: BoundExpr,
  fieldName: string,
  functionName: string,
  sourceText: string,
  file?: string,
): { field: { offset: number; type: SemanticScalarType } } {
  if (pointer.type.kind !== "pointer") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointer expressions in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
  const layout = currentAggregateLayouts.get(`${aggregatePointee.aggregateKind}:${aggregatePointee.name}`);
  if (!layout) {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not know ${aggregatePointee.aggregateKind} ${aggregatePointee.name} for pointer-member access in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  const field = layout.fields.get(fieldName);
  if (!field) {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset does not know field '${fieldName}' on ${aggregatePointee.aggregateKind} ${aggregatePointee.name} in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  if (field.type.kind !== "scalar") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports scalar field access on ${aggregatePointee.aggregateKind} ${aggregatePointee.name}->${fieldName} in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  return { field: { offset: field.offset, type: toSemanticScalarType(field.type.name) } };
}

function getAggregateObjectPointerFromExpr(
  targetExpr: Extract<SourceExpr, { kind: "memberAccess" | "memberExprAccess" | "pointerMemberAccess" | "pointerMemberExprAccess" }>,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): { pointer: BoundExpr; type: SemanticAggregateType } {
  if (targetExpr.kind === "pointerMemberAccess" || targetExpr.kind === "pointerMemberExprAccess") {
    const pointer = targetExpr.kind === "pointerMemberAccess"
      ? (() => {
        const symbol = lookupVisible(scope, targetExpr.name);
        if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param") || symbol.type.kind !== "pointer") {
          throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers, got '${targetExpr.name}->${targetExpr.field}' in ${functionName}().`, {
            file,
            offset: 0,
          });
        }
        return { kind: "ref", symbol, type: symbol.type } as BoundExpr;
      })()
      : analyzeExpr(targetExpr.target, scope, functionSymbols, functionName, sourceText, file);
    if (pointer.type.kind !== "pointer") {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested pointer-member access on struct/union pointers in ${functionName}().`, {
        file,
        offset: 0,
      });
    }
    const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
    const field = getAggregateFieldLayout(
      toSemanticType({
        kind: "aggregate",
        aggregateKind: aggregatePointee.aggregateKind,
        name: aggregatePointee.name,
      }) as SemanticAggregateType,
      targetExpr.field,
      functionName,
      sourceText,
      file,
    );
    if (field.type.kind !== "aggregate") {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested pointer-member access through aggregate fields in ${functionName}().`, {
        file,
        offset: 0,
      });
    }
    return {
      pointer: {
        kind: "pointerAdd",
        pointer,
        index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
        pointee: "char",
        type: toSemanticPointerType("char"),
      },
      type: toSemanticType(field.type) as SemanticAggregateType,
    };
  }
  const baseExpr = targetExpr.kind === "memberAccess"
    ? ({ kind: "ref", name: targetExpr.name } satisfies SourceExpr)
    : targetExpr.target;
  const baseTarget = getAggregateBasePointerFromExpr(baseExpr, scope, functionSymbols, functionName, sourceText, file);
  const field = getAggregateFieldLayout(baseTarget.type, targetExpr.field, functionName, sourceText, file);
  if (field.type.kind !== "aggregate") {
    throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested aggregate member chains through aggregate fields in ${functionName}().`, {
      file,
      offset: 0,
    });
  }
  return {
    pointer: {
      kind: "pointerAdd",
      pointer: baseTarget.pointer,
      index: { kind: "const", value: field.offset, type: toSemanticScalarType("int") },
      pointee: "char",
      type: toSemanticPointerType("char"),
    },
    type: toSemanticType(field.type) as SemanticAggregateType,
  };
}

function getAggregateBasePointerFromExpr(
  targetExpr: SourceExpr,
  scope: Scope,
  functionSymbols: Map<string, BoundFunctionSymbol>,
  functionName: string,
  sourceText: string,
  file?: string,
): { pointer: BoundExpr; type: SemanticAggregateType } {
  if (targetExpr.kind === "arrayIndex") {
    const symbol = lookupVisible(scope, targetExpr.name);
    if (
      !symbol
      || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global")
      || symbol.type.kind !== "array"
      || !symbol.type.elementValueType
      || symbol.type.elementValueType.kind !== "aggregate"
    ) {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter C Subset expected an aggregate array element in ${functionName}().`, { file, offset: 0 });
    }
    const type = symbol.type.elementValueType;
    const base = symbol.kind === "global"
      ? { kind: "globalAddress", symbol, type: toSemanticPointerType("char") } satisfies BoundExpr
      : symbol.kind === "local"
        ? { kind: "localAddress", symbol, type: toSemanticPointerType("char") } satisfies BoundExpr
        : { kind: "ref", symbol, type: toSemanticPointerType("char") } satisfies BoundExpr;
    return {
      pointer: {
        kind: "arrayElementAddress",
        base,
        indices: [analyzeExpr(targetExpr.index, scope, functionSymbols, functionName, sourceText, file)],
        scales: [type.size],
        type: toSemanticPointerType({ kind: "aggregate", aggregateKind: type.aggregateKind, name: type.name }),
      },
      type,
    };
  }
  if (targetExpr.kind === "arrayPointerElement") {
    const rowPointer = analyzeExpr(targetExpr.pointer, scope, functionSymbols, functionName, sourceText, file);
    if (
      rowPointer.type.kind !== "pointer"
      || typeof rowPointer.type.pointee === "string"
      || rowPointer.type.pointee.kind !== "arrayPointer"
      || !rowPointer.type.pointee.elementValueType
      || rowPointer.type.pointee.elementValueType.kind !== "aggregate"
    ) {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter C Subset expected an aggregate array element in ${functionName}().`, { file, offset: 0 });
    }
    const aggregate = rowPointer.type.pointee.elementValueType;
    const type = toSemanticType(aggregate) as SemanticAggregateType;
    return {
      pointer: {
        kind: "arrayElementAddress",
        base: rowPointer,
        indices: [analyzeExpr(targetExpr.index, scope, functionSymbols, functionName, sourceText, file)],
        scales: [type.size],
        type: toSemanticPointerType({ kind: "aggregate", aggregateKind: aggregate.aggregateKind, name: aggregate.name }),
      },
      type,
    };
  }
  if (targetExpr.kind === "ref") {
    const symbol = lookupVisible(scope, targetExpr.name);
    if (!symbol || (symbol.kind !== "local" && symbol.kind !== "param" && symbol.kind !== "global") || symbol.type.kind !== "aggregate") {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested aggregate lvalues on local/global struct/union objects in ${functionName}().`, {
        file,
        offset: 0,
      });
    }
    return {
      pointer: symbol.kind === "param"
        ? {
          kind: "ref",
          symbol,
          type: toSemanticPointerType({ kind: "aggregate", aggregateKind: symbol.type.aggregateKind, name: symbol.type.name }),
        }
        : getAggregateStorageAddress(symbol, symbol.type),
      type: symbol.type,
    };
  }
  if (targetExpr.kind === "deref") {
    const pointer = analyzeExpr(targetExpr.expr, scope, functionSymbols, functionName, sourceText, file);
    if (pointer.type.kind !== "pointer" || typeof pointer.type.pointee === "string") {
      throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested aggregate lvalues on dereferenced struct/union pointers in ${functionName}().`, {
        file,
        offset: 0,
      });
    }
    const aggregatePointee = getAggregatePointerPointee(pointer.type, functionName, sourceText, file);
    return {
      pointer,
      type: toSemanticType({
        kind: "aggregate",
        aggregateKind: aggregatePointee.aggregateKind,
        name: aggregatePointee.name,
      }) as SemanticAggregateType,
    };
  }
  if (
    targetExpr.kind === "memberAccess"
    || targetExpr.kind === "memberExprAccess"
    || targetExpr.kind === "pointerMemberAccess"
    || targetExpr.kind === "pointerMemberExprAccess"
  ) {
    return getAggregateObjectPointerFromExpr(targetExpr, scope, functionSymbols, functionName, sourceText, file);
  }
  throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports nested aggregate lvalues on local aggregates or dereferenced struct/union pointers in ${functionName}().`, {
    file,
    offset: 0,
  });
}

function getAggregatePointerPointee(
  type: SemanticPointerType,
  functionName: string,
  sourceText: string,
  file?: string,
): AggregateTypeRef {
  if (typeof type.pointee !== "string" && type.pointee.kind === "aggregate") {
    return type.pointee;
  }
  throwDiagnostic(sourceText, `TsSccCompilerAdapter Phase C subset only supports '->' on struct/union pointers in ${functionName}().`, {
    file,
    offset: 0,
  });
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

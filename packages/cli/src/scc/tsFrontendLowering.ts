import {
  BoundAggregateValueExpr,
  BoundBlock,
  BoundExpr,
  BoundForInit,
  BoundFunction,
  BoundLocalSymbol,
  BoundProgram,
  BoundSimpleStmt,
  BoundStmt,
} from "./tsFrontendSemantic";
import {
  AggregateValueIR,
  DataSpec,
  ExprIR,
  FunctionIR,
  ProgramSpec,
  RefIR,
  StmtIRHigh,
  lowerFunctionIR,
} from "./tsProgram";

export function lowerSourceProgram(program: BoundProgram, moduleName: string, sourceText: string, file?: string): ProgramSpec {
  const definedFunctions = new Set(program.functions.map((fn) => fn.name));
  const externs = new Set<string>();
  const state: LoweringState = { nextStringId: 0, data: [] };
  const functions = program.functions.map((fn) => lowerFunction(fn, externs, definedFunctions, sourceText, state, file));
  return {
    moduleName,
    exports: definedFunctions.has("main") ? ["main"] : [],
    externs: Array.from(externs),
    data: state.data.length > 0 ? state.data : undefined,
    functions,
    includeBss: true,
  };
}

type LoweringState = {
  nextStringId: number;
  data: DataSpec[];
};

type FunctionLoweringState = {
  baseLocalCount: number;
  tempLocals: number[];
  paramSlotBase: number;
  returnType: BoundFunction["returnType"];
};

function lowerFunction(
  fn: BoundFunction,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  file?: string,
) {
  const functionState: FunctionLoweringState = {
    baseLocalCount: fn.locals.length,
    tempLocals: [],
    paramSlotBase: fn.returnType.kind === "aggregate" ? 1 : 0,
    returnType: fn.returnType,
  };
  const body = lowerBlock(fn.body, externs, definedFunctions, sourceText, state, functionState, file);
  const functionIr: FunctionIR = {
    name: fn.name,
    params: [...(fn.returnType.kind === "aggregate" ? [2 as const] : []), ...fn.params.map((param) => getParamWidth(param))],
    locals: [...fn.locals.map((local) => local.storageBytes), ...functionState.tempLocals],
    body,
  };
  return lowerFunctionIR(functionIr);
}

function lowerBlock(
  block: BoundBlock,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh[] {
  return block.statements.map((stmt) => lowerStmt(stmt, externs, definedFunctions, sourceText, state, functionState, file));
}

function lowerStmt(
  stmt: BoundStmt,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh {
  switch (stmt.kind) {
    case "return":
      if (functionState.returnType.kind === "aggregate") {
        if (!isAggregateCallArg(stmt.expr)) {
          throw new Error("Internal lowering error: aggregate-returning function expected aggregate return expr.");
        }
        return {
          kind: "ifExprZero",
          expr: { kind: "const", value: 1 },
          thenBody: [
            ...lowerAggregateReturnToReturnSlot(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
            { kind: "returnVoid" },
          ],
          elseBody: [],
        };
      }
      return { kind: "returnExpr", expr: lowerExpr(stmt.expr as BoundExpr, externs, definedFunctions, sourceText, state, functionState, file) };
    case "expr":
      return { kind: "evalExpr", expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file) };
    case "if":
      return {
        kind: "ifExprZero",
        expr: lowerExpr(stmt.condition, externs, definedFunctions, sourceText, state, functionState, file),
        thenBody: lowerBlock(stmt.thenBlock, externs, definedFunctions, sourceText, state, functionState, file),
        elseBody: stmt.elseBlock ? lowerBlock(stmt.elseBlock, externs, definedFunctions, sourceText, state, functionState, file) : [],
      };
    case "while": {
      return {
        kind: "whileExprNonZero",
        expr: lowerExpr(stmt.condition, externs, definedFunctions, sourceText, state, functionState, file),
        body: lowerBlock(stmt.body, externs, definedFunctions, sourceText, state, functionState, file),
      };
    }
    case "doWhile":
      return {
        kind: "doWhileExprNonZero",
        body: lowerBlock(stmt.body, externs, definedFunctions, sourceText, state, functionState, file),
        expr: lowerExpr(stmt.condition, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "for":
      return lowerForStmt(stmt, externs, definedFunctions, sourceText, state, functionState, file);
    case "switch":
      externs.add(".eq");
      return {
        kind: "switchExpr",
        expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
        cases: stmt.cases.map((entry) => ({
          value: entry.value,
          body: lowerBlock(entry.body, externs, definedFunctions, sourceText, state, functionState, file),
        })),
        defaultBody: stmt.defaultCase ? lowerBlock(stmt.defaultCase, externs, definedFunctions, sourceText, state, functionState, file) : [],
      };
    case "assign": {
      const decLocal = tryLowerDecLocalByte(stmt);
      if (decLocal) {
        return decLocal;
      }
      if (stmt.expr.kind === "const") {
        return {
          kind: "assignLocalConst",
          slot: stmt.local.slot,
          width: getLocalValueWidth(stmt.local),
          value: stmt.expr.value,
        };
      }
      return {
        kind: "assignLocalExpr",
        slot: stmt.local.slot,
        width: getLocalValueWidth(stmt.local),
        expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
      };
    }
    case "aggregateAssign":
      return lowerAggregateAssignWrapper(stmt.target, stmt.source, externs, definedFunctions, sourceText, state, functionState, file);
    case "arrayAssign":
      if (stmt.target.kind === "param") {
        return lowerParamArrayAssign(stmt, externs, definedFunctions, sourceText, state, functionState, file);
      }
      if (stmt.index.kind === "const" && stmt.expr.kind === "const") {
        return {
          kind: "assignLocalArrayConst",
          slot: stmt.target.slot,
          index: stmt.index.value,
          value: stmt.expr.value,
        };
      }
      if (stmt.index.kind === "const") {
        return {
          kind: "assignLocalArrayExpr",
          slot: stmt.target.slot,
          index: stmt.index.value,
          expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
        };
      }
      return {
        kind: "assignLocalArrayDynamic",
        slot: stmt.target.slot,
        index: lowerExpr(stmt.index, externs, definedFunctions, sourceText, state, functionState, file),
        expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "break":
      return { kind: "break" };
    case "continue":
      return { kind: "continue" };
    default:
      return assertNever(stmt);
  }
}

function lowerForStmt(
  stmt: Extract<BoundStmt, { kind: "for" }>,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh {
  const loopBody = lowerBlock(stmt.body, externs, definedFunctions, sourceText, state, functionState, file);
  const init = stmt.initializer ? lowerForInit(stmt.initializer, externs, definedFunctions, sourceText, state, functionState, file) : undefined;
  const step = stmt.step ? lowerSimpleStmt(stmt.step, externs, definedFunctions, sourceText, state, functionState, file) : undefined;
  const loopStmt: StmtIRHigh = {
    kind: "whileExprNonZero",
    expr: stmt.condition
      ? lowerExpr(stmt.condition, externs, definedFunctions, sourceText, state, functionState, file)
      : { kind: "const", value: 1 },
    body: loopBody,
    stepBody: step ? [step] : [],
  };
  if (!init) {
    return loopStmt;
  }
  return {
    kind: "ifExprZero",
    expr: { kind: "const", value: 1 },
    thenBody: [init, loopStmt],
    elseBody: [],
  };
}

function lowerForInit(
  init: BoundForInit,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh {
  if (init.kind !== "localDecl") {
    return lowerSimpleStmt(init, externs, definedFunctions, sourceText, state, functionState, file);
  }
  if (!init.initializer) {
    return { kind: "evalExpr", expr: { kind: "const", value: 0 } };
  }
  if (init.initializer.kind === "const") {
    return {
      kind: "assignLocalConst",
      slot: init.local.slot,
      width: getLocalValueWidth(init.local),
      value: init.initializer.value,
    };
  }
  return {
    kind: "assignLocalExpr",
    slot: init.local.slot,
    width: getLocalValueWidth(init.local),
    expr: lowerExpr(init.initializer, externs, definedFunctions, sourceText, state, functionState, file),
  };
}

function lowerSimpleStmt(
  stmt: BoundSimpleStmt,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh {
  if (stmt.kind === "expr") {
    return { kind: "evalExpr", expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file) };
  }
  if (stmt.kind === "aggregateAssign") {
    return lowerAggregateAssignWrapper(stmt.target, stmt.source, externs, definedFunctions, sourceText, state, functionState, file);
  }
  if (stmt.kind === "arrayAssign") {
    if (stmt.target.kind === "param") {
      return lowerParamArrayAssign(stmt, externs, definedFunctions, sourceText, state, functionState, file);
    }
    if (stmt.index.kind === "const" && stmt.expr.kind === "const") {
      return {
        kind: "assignLocalArrayConst",
        slot: stmt.target.slot,
        index: stmt.index.value,
        value: stmt.expr.value,
      };
    }
    if (stmt.index.kind === "const") {
      return {
        kind: "assignLocalArrayExpr",
        slot: stmt.target.slot,
        index: stmt.index.value,
        expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
      };
    }
    return {
      kind: "assignLocalArrayDynamic",
      slot: stmt.target.slot,
      index: lowerExpr(stmt.index, externs, definedFunctions, sourceText, state, functionState, file),
      expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
    };
  }
  const decLocal = tryLowerDecLocalByte(stmt);
  if (decLocal) {
    return decLocal;
  }
  if (stmt.expr.kind === "const") {
    return {
      kind: "assignLocalConst",
      slot: stmt.local.slot,
      width: getLocalValueWidth(stmt.local),
      value: stmt.expr.value,
    };
  }
  return {
    kind: "assignLocalExpr",
    slot: stmt.local.slot,
    width: getLocalValueWidth(stmt.local),
    expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
  };
}

function lowerAggregateAssignWrapper(
  target: BoundLocalSymbol,
  source: BoundAggregateValueExpr,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh {
  return {
    kind: "ifExprZero",
    expr: { kind: "const", value: 1 },
    thenBody: lowerAggregateAssignToLocalSlot(target.slot, target.type, source, externs, definedFunctions, sourceText, state, functionState, file),
    elseBody: [],
  };
}

function lowerAggregateAssignToLocalSlot(
  targetSlot: number,
  targetType: BoundLocalSymbol["type"],
  source: BoundAggregateValueExpr,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh[] {
  const aggregateType = targetType;
  if (aggregateType.kind !== "aggregate" || source.type.kind !== "aggregate") {
    throw new Error("Internal lowering error: aggregate assignment expected aggregate locals.");
  }
  switch (source.kind) {
    case "aggregateRef": {
      const fields = getAggregateFieldStores(aggregateType);
      return fields.map((field) => ({
        kind: "evalExpr",
        expr: {
          kind: field.width === 1 ? "assignDerefByte" : "assignDerefWord",
          pointer: {
            kind: "pointerAdd",
            pointer: { kind: "localAddress", slot: targetSlot },
            index: { kind: "const", value: field.offset },
            scale: 1,
          },
          expr: {
            kind: field.width === 1 ? "derefByte" : "derefWord",
            pointer: {
              kind: "pointerAdd",
              pointer: source.symbol.kind === "local"
                ? { kind: "localAddress", slot: source.symbol.slot }
                : { kind: "ref", scope: "arg", width: 2, slot: getParamIrSlot(source.symbol.slot, functionState) },
              index: { kind: "const", value: field.offset },
              scale: 1,
            },
          },
        },
      }));
    }
    case "aggregateAssignExpr":
      return [
        ...lowerAggregateAssignToLocalSlot(source.target.slot, source.target.type, source.source, externs, definedFunctions, sourceText, state, functionState, file),
        ...(targetSlot === source.target.slot
          ? []
          : lowerAggregateAssignToLocalSlot(targetSlot, targetType, {
            kind: "aggregateRef",
            symbol: source.target,
            type: source.target.type,
          }, externs, definedFunctions, sourceText, state, functionState, file)),
      ];
    case "comma":
      return [
        { kind: "evalExpr", expr: lowerExpr(source.left, externs, definedFunctions, sourceText, state, functionState, file) },
        ...lowerAggregateAssignToLocalSlot(targetSlot, targetType, source.right, externs, definedFunctions, sourceText, state, functionState, file),
      ];
    case "conditional":
      return [{
        kind: "ifExprZero",
        expr: lowerExpr(source.condition, externs, definedFunctions, sourceText, state, functionState, file),
        thenBody: lowerAggregateAssignToLocalSlot(targetSlot, targetType, source.thenExpr, externs, definedFunctions, sourceText, state, functionState, file),
        elseBody: lowerAggregateAssignToLocalSlot(targetSlot, targetType, source.elseExpr, externs, definedFunctions, sourceText, state, functionState, file),
      }];
    case "call":
      return [{
        kind: "evalExpr",
        expr: {
          kind: "call",
          target: source.target.name,
          args: [
            { kind: "expr", expr: { kind: "localAddress", slot: targetSlot } },
            ...source.args.map((arg) => isAggregateCallArg(arg)
              ? {
                kind: "aggregateAddress" as const,
                source: lowerAggregateValueExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                tempSlot: allocateTempLocal(functionState, arg.type.size),
              }
              : {
                kind: "expr" as const,
                expr: lowerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
              }),
          ],
        },
      }];
    default:
      return assertNever(source);
  }
}

function lowerAggregateCopyLocalToReturnSlot(sourceSlot: number, size: number): StmtIRHigh[] {
  return Array.from({ length: size }, (_, index) => ({
    kind: "evalExpr" as const,
    expr: {
      kind: "assignDerefByte" as const,
      pointer: {
        kind: "pointerAdd" as const,
        pointer: { kind: "ref" as const, scope: "arg" as const, width: 2 as const, slot: 0 },
        index: { kind: "const" as const, value: index },
        scale: 1 as const,
      },
      expr: {
        kind: "derefByte" as const,
        pointer: {
          kind: "pointerAdd" as const,
          pointer: { kind: "localAddress" as const, slot: sourceSlot },
          index: { kind: "const" as const, value: index },
          scale: 1 as const,
        },
      },
    },
  }));
}

function lowerAggregateCopyArgAddressToReturnSlot(sourceSlot: number, size: number): StmtIRHigh[] {
  return Array.from({ length: size }, (_, index) => ({
    kind: "evalExpr" as const,
    expr: {
      kind: "assignDerefByte" as const,
      pointer: {
        kind: "pointerAdd" as const,
        pointer: { kind: "ref" as const, scope: "arg" as const, width: 2 as const, slot: 0 },
        index: { kind: "const" as const, value: index },
        scale: 1 as const,
      },
      expr: {
        kind: "derefByte" as const,
        pointer: {
          kind: "pointerAdd" as const,
          pointer: { kind: "ref" as const, scope: "arg" as const, width: 2 as const, slot: sourceSlot },
          index: { kind: "const" as const, value: index },
          scale: 1 as const,
        },
      },
    },
  }));
}

function lowerAggregateReturnToReturnSlot(
  source: BoundAggregateValueExpr,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh[] {
  switch (source.kind) {
    case "aggregateRef":
      return source.symbol.kind === "local"
        ? lowerAggregateCopyLocalToReturnSlot(source.symbol.slot, source.type.size)
        : lowerAggregateCopyArgAddressToReturnSlot(getParamIrSlot(source.symbol.slot, functionState), source.type.size);
    case "aggregateAssignExpr":
      return [
        ...lowerAggregateAssignToLocalSlot(source.target.slot, source.target.type, source.source, externs, definedFunctions, sourceText, state, functionState, file),
        ...lowerAggregateCopyLocalToReturnSlot(source.target.slot, source.type.size),
      ];
    case "call":
      return [{
        kind: "evalExpr",
        expr: {
          kind: "call",
          target: source.target.name,
          args: [
            { kind: "expr", expr: { kind: "ref", scope: "arg", width: 2, slot: 0 } },
            ...source.args.map((arg) => isAggregateCallArg(arg)
              ? {
                kind: "aggregateAddress" as const,
                source: lowerAggregateValueExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
                tempSlot: allocateTempLocal(functionState, arg.type.size),
              }
              : {
                kind: "expr" as const,
                expr: lowerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
              }),
          ],
        },
      }];
    case "comma":
    case "conditional":
      return lowerAggregateReturnViaTempLocal(source, externs, definedFunctions, sourceText, state, functionState, file);
    default:
      return assertNever(source);
  }
}

function lowerAggregateReturnViaTempLocal(
  source: BoundAggregateValueExpr,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh[] {
  const tempSlot = allocateTempLocal(functionState, source.type.size);
  return [
    ...lowerAggregateAssignToLocalSlot(tempSlot, source.type, source, externs, definedFunctions, sourceText, state, functionState, file),
    ...lowerAggregateCopyLocalToReturnSlot(tempSlot, source.type.size),
  ];
}

function getAggregateFieldStores(type: BoundLocalSymbol["type"]): Array<{ offset: number; width: 1 | 2 }> {
  if (type.kind !== "aggregate") {
    throw new Error("Internal lowering error: expected aggregate type.");
  }
  const key = `${type.aggregateKind}:${type.name}`;
  switch (key) {
    default:
      return Array.from({ length: type.size }, (_, index) => ({ offset: index, width: 1 as const }));
  }
}

function tryLowerDecLocalByte(stmt: Extract<BoundStmt, { kind: "assign" }> | BoundSimpleStmt & { kind: "assign" }): StmtIRHigh | null {
  if (stmt.local.type.kind !== "scalar"
    || stmt.local.type.width !== 1
    || stmt.expr.kind !== "additive"
    || stmt.expr.op !== "-"
    || stmt.expr.right.kind !== "const"
    || stmt.expr.right.value !== 1) {
    return null;
  }
  if (stmt.expr.left.kind !== "ref" || stmt.expr.left.symbol.kind !== "local" || stmt.expr.left.symbol.slot !== stmt.local.slot) {
    return null;
  }
  return {
    kind: "decLocalByte",
    slot: stmt.local.slot,
  };
}

function getScalarLocalWidth(local: BoundLocalSymbol): 1 | 2 {
  if (local.type.kind !== "scalar") {
    throw new Error(`Internal lowering error: expected scalar local, got ${JSON.stringify(local.type)}`);
  }
  return local.type.width;
}

function getLocalValueWidth(local: BoundLocalSymbol): 1 | 2 {
  if (local.type.kind === "array" || local.type.kind === "aggregate") {
    throw new Error(`Internal lowering error: expected scalar/pointer local, got ${JSON.stringify(local.type)}`);
  }
  return local.type.width;
}

function getParamWidth(param: BoundFunction["params"][number]): 1 | 2 {
  if (param.type.kind === "array") {
    return 2;
  }
  if (param.type.kind === "aggregate") {
    return 2;
  }
  return param.type.width;
}

function lowerParamArrayAssign(
  stmt: Extract<BoundStmt, { kind: "arrayAssign" }> | Extract<BoundSimpleStmt, { kind: "arrayAssign" }>,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh {
  if (stmt.target.kind !== "param") {
    throw new Error("Internal lowering error: expected parameter array target.");
  }
  return {
    kind: "assignArgArrayDynamic",
    slot: stmt.target.slot,
    index: lowerExpr(stmt.index, externs, definedFunctions, sourceText, state, functionState, file),
    expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, functionState, file),
  };
}

function lowerExpr(
  expr: BoundExpr,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): ExprIR {
  switch (expr.kind) {
    case "const":
      return { kind: "const", value: expr.value };
    case "string":
      return { kind: "dataAddress", label: internStringLiteral(state, expr.value) };
    case "ref":
      return {
        kind: "ref",
        scope: expr.symbol.kind === "local" ? "local" : "arg",
        width: expr.symbol.kind === "local"
          ? getLocalValueWidth(expr.symbol)
          : expr.symbol.type.kind === "array"
            ? 2
            : expr.symbol.type.kind === "aggregate"
              ? (() => {
                throw new Error(`Internal lowering error: aggregate parameter values are not supported, got ${JSON.stringify(expr.symbol.type)}`);
              })()
            : expr.symbol.type.width,
        slot: expr.symbol.kind === "local" ? expr.symbol.slot : getParamIrSlot(expr.symbol.slot, functionState),
      } satisfies RefIR;
    case "localAddress":
      return {
        kind: "localAddress",
        slot: expr.symbol.slot,
      };
    case "aggregateFieldAccess":
      return {
        kind: expr.type.width === 1 ? "derefByte" : "derefWord",
        pointer: {
          kind: "pointerAdd",
          pointer: expr.symbol.kind === "local"
            ? { kind: "localAddress", slot: expr.symbol.slot }
            : { kind: "ref", scope: "arg", width: 2, slot: getParamIrSlot(expr.symbol.slot, functionState) },
          index: { kind: "const", value: expr.offset },
          scale: 1,
        },
      };
    case "aggregateValueFieldAccess": {
      const tempSlot = allocateTempLocal(functionState, expr.source.type.size);
      return {
        kind: "aggregateValueFieldAccess",
        source: lowerAggregateValueExpr(expr.source, externs, definedFunctions, sourceText, state, functionState, file),
        tempSlot,
        offset: expr.offset,
        width: expr.type.width,
      };
    }
    case "aggregateValueFieldAddress": {
      const tempSlot = allocateTempLocal(functionState, expr.source.type.size);
      return {
        kind: "aggregateValueFieldAddress",
        source: lowerAggregateValueExpr(expr.source, externs, definedFunctions, sourceText, state, functionState, file),
        tempSlot,
        offset: expr.offset,
      };
    }
    case "pointerAdd":
      return {
        kind: "pointerAdd",
        pointer: lowerExpr(expr.pointer, externs, definedFunctions, sourceText, state, functionState, file),
        index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
        scale: expr.pointee === "int" ? 2 : 1,
      };
    case "deref":
      return {
        kind: expr.type.width === 1 ? "derefByte" : "derefWord",
        pointer: lowerExpr(expr.pointer, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "derefAssign":
      return {
        kind: expr.type.width === 1 ? "assignDerefByte" : "assignDerefWord",
        pointer: lowerExpr(expr.pointer, externs, definedFunctions, sourceText, state, functionState, file),
        expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "localArrayElement":
      return {
        kind: "localArrayElement",
        slot: expr.symbol.slot,
        index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "paramArrayElement":
      return {
        kind: "argArrayElement",
        slot: getParamIrSlot(expr.symbol.slot, functionState),
        index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "compare": {
      const helper = compareOpToHelper(expr.op);
      externs.add(helper);
      return {
        kind: "compare",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
        helper,
      };
    }
    case "logical":
      return {
        kind: "logical",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
        op: expr.op,
      };
    case "bitwise":
      return {
        kind: "bitwise",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
        op: expr.op,
      };
    case "shift": {
      const helper = expr.op === "<<" ? ".asl" : ".asr";
      externs.add(helper);
      return {
        kind: "helperBinary",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
        helper,
      };
    }
    case "call":
      if (expr.target.kind === "extern" || !definedFunctions.has(expr.target.name)) {
        externs.add(expr.target.name);
      }
      return {
        kind: "call",
        target: expr.target.name,
        args: expr.args.map((arg) => isAggregateCallArg(arg)
          ? {
            kind: "aggregateAddress",
            source: lowerAggregateValueExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
            tempSlot: allocateTempLocal(functionState, arg.type.size),
          }
          : {
            kind: "expr",
            expr: lowerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
          }),
      };
    case "preIncDec":
      return {
        kind: "incDecLocal",
        slot: expr.local.slot,
        width: getLocalValueWidth(expr.local),
        step: expr.local.type.kind === "pointer" && expr.local.type.pointee === "int" ? 2 : 1,
        op: expr.op,
        mode: "prefix",
      };
    case "postIncDec":
      return {
        kind: "incDecLocal",
        slot: expr.local.slot,
        width: getLocalValueWidth(expr.local),
        step: expr.local.type.kind === "pointer" && expr.local.type.pointee === "int" ? 2 : 1,
        op: expr.op,
        mode: "postfix",
      };
    case "preArrayIncDec":
      return {
        kind: expr.target.kind === "param" ? "incDecArgArray" : "incDecLocalArray",
        slot: expr.target.slot,
        index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
        op: expr.op,
        mode: "prefix",
      };
    case "postArrayIncDec":
      return {
        kind: expr.target.kind === "param" ? "incDecArgArray" : "incDecLocalArray",
        slot: expr.target.slot,
        index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
        op: expr.op,
        mode: "postfix",
      };
    case "derefIncDec":
      return {
        kind: "incDecDeref",
        pointer: lowerExpr(expr.pointer, externs, definedFunctions, sourceText, state, functionState, file),
        width: expr.type.width,
        op: expr.op,
        mode: expr.mode,
      };
    case "assign":
      return {
        kind: "assignLocal",
        slot: expr.local.slot,
        width: getLocalValueWidth(expr.local),
        expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "arrayAssignExpr":
      return {
        kind: expr.target.kind === "param" ? "assignArgArray" : "assignLocalArray",
        slot: expr.target.slot,
        index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
        expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "comma":
      return {
        kind: "comma",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "conditional":
      return {
        kind: "conditional",
        condition: lowerExpr(expr.condition, externs, definedFunctions, sourceText, state, functionState, file),
        thenExpr: lowerExpr(expr.thenExpr, externs, definedFunctions, sourceText, state, functionState, file),
        elseExpr: lowerExpr(expr.elseExpr, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "additive":
      return {
        kind: "additive",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
        op: expr.op,
      };
    case "multiplicative":
      if (expr.op === "*") {
        externs.add(".mul");
        return {
          kind: "helperBinary",
          left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
          right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
          helper: ".mul",
        };
      }
      externs.add(".div");
      return {
        kind: "divmod",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
        result: expr.op === "/" ? "quotient" : "remainder",
      };
    default:
      return assertNever(expr);
  }
}

function lowerAggregateValueExpr(
  expr: BoundAggregateValueExpr,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): AggregateValueIR {
  switch (expr.kind) {
    case "aggregateRef":
      return {
        kind: "aggregateRef",
        scope: expr.symbol.kind === "local" ? "local" : "arg",
        slot: expr.symbol.kind === "local" ? expr.symbol.slot : getParamIrSlot(expr.symbol.slot, functionState),
        size: expr.type.size,
      };
    case "aggregateAssignExpr":
      return {
        kind: "aggregateAssignExpr",
        targetSlot: expr.target.slot,
        source: lowerAggregateValueExpr(expr.source, externs, definedFunctions, sourceText, state, functionState, file),
        size: expr.type.size,
      };
    case "call":
      return {
        kind: "call",
        target: expr.target.name,
        args: expr.args.map((arg) => isAggregateCallArg(arg)
          ? {
            kind: "aggregateAddress",
            source: lowerAggregateValueExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
            tempSlot: allocateTempLocal(functionState, arg.type.size),
          }
          : {
            kind: "expr",
            expr: lowerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
          }),
        size: expr.type.size,
      };
    case "comma":
      return {
        kind: "comma",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, functionState, file),
        right: lowerAggregateValueExpr(expr.right, externs, definedFunctions, sourceText, state, functionState, file),
        size: expr.type.size,
      };
    case "conditional":
      return {
        kind: "conditional",
        condition: lowerExpr(expr.condition, externs, definedFunctions, sourceText, state, functionState, file),
        thenExpr: lowerAggregateValueExpr(expr.thenExpr, externs, definedFunctions, sourceText, state, functionState, file),
        elseExpr: lowerAggregateValueExpr(expr.elseExpr, externs, definedFunctions, sourceText, state, functionState, file),
        size: expr.type.size,
      };
    default:
      return assertNever(expr);
  }
}

function allocateTempLocal(state: FunctionLoweringState, size: number): number {
  const slot = state.baseLocalCount + state.tempLocals.length;
  state.tempLocals.push(size);
  return slot;
}

function isAggregateCallArg(arg: BoundExpr | BoundAggregateValueExpr): arg is BoundAggregateValueExpr {
  return "type" in arg && arg.type.kind === "aggregate";
}

function getParamIrSlot(slot: number, state: FunctionLoweringState): number {
  return slot + state.paramSlotBase;
}

function internStringLiteral(state: LoweringState, value: string): string {
  const label = `.str${state.nextStringId}`;
  state.nextStringId += 1;
  state.data.push({
    label,
    directive: ".ascii",
    value: encodeAsciiLiteral(value),
  });
  return label;
}

function encodeAsciiLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/\u0000/g, "\\0");
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

function assertNever(value: never): never {
  throw new Error(`Unhandled lowering node: ${JSON.stringify(value)}`);
}

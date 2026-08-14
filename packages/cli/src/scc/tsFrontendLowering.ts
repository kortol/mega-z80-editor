import {
  SourceInitializer,
  SourceType,
} from "./tsFrontendAst";
import {
  BoundAggregateValueExpr,
  BoundBlock,
  BoundExpr,
  BoundForInit,
  BoundFunction,
  BoundGlobalSymbol,
  BoundParamSymbol,
  getAggregateLayoutFields,
  getAggregateLayoutSize,
  BoundLocalSymbol,
  BoundProgram,
  BoundSimpleStmt,
  BoundStmt,
  SemanticAggregateType,
  SemanticType,
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
  const state: LoweringState = { nextStringId: 0, data: [], bss: [] };
  for (const global of program.globals) {
    const storage = lowerGlobalStorage(global);
    if (storage.data) {
      state.data.push(storage.data);
    }
    if (storage.bss) {
      state.bss.push(storage.bss);
    }
  }
  const functions = program.functions.map((fn) => lowerFunction(fn, externs, definedFunctions, sourceText, state, file));
  return {
    moduleName,
    exports: definedFunctions.has("main") ? ["main"] : [],
    externs: Array.from(externs),
    data: state.data.length > 0 ? state.data : undefined,
    bss: state.bss.length > 0 ? state.bss : undefined,
    functions,
    includeBss: true,
  };
}

type LoweringState = {
  nextStringId: number;
  data: DataSpec[];
  bss: DataSpec[];
};

function lowerGlobalStorage(global: BoundGlobalSymbol): { data?: DataSpec; bss?: DataSpec } {
  const label = global.name;
  switch (global.type.kind) {
    case "scalar":
      return global.initializer
        ? {
          data: {
            label,
            directive: global.type.width === 1 ? ".db" : ".dw",
            value: global.initializer.kind === "expr" && global.initializer.expr.kind === "const"
              ? `${global.initializer.expr.value}`
              : "0",
          },
        }
        : {
          bss: {
            label,
            directive: ".ds",
            value: `${global.type.width}`,
          },
        };
    case "pointer":
      return global.initializer
        ? {
          data: {
            label,
            directive: ".dw",
            value: global.initializer.kind === "expr" && global.initializer.expr.kind === "const"
              ? `${global.initializer.expr.value}`
              : "0",
          },
        }
        : {
          bss: {
            label,
            directive: ".ds",
            value: "2",
          },
        };
    case "array":
      return global.initializer
        ? {
          data: {
            label,
            directive: ".db",
            value: lowerGlobalArrayInitializer(global.initializer, global.type.length ?? 0),
          },
        }
        : {
          bss: {
            label,
            directive: ".ds",
            value: `${global.type.length ?? 0}`,
          },
        };
    case "aggregate":
      return global.initializer
        ? {
          data: {
            label,
            directive: ".db",
            value: lowerGlobalAggregateInitializer(global.name, global.type, global.initializer),
          },
        }
        : {
          bss: {
            label,
            directive: ".ds",
            value: `${global.type.size}`,
          },
        };
    case "functionPointer":
      return global.initializer
        ? {
          data: {
            label,
            directive: ".dw",
            value: global.initializer.kind === "expr"
              ? global.initializer.expr.kind === "const"
                ? `${global.initializer.expr.value}`
                : global.initializer.expr.kind === "addressOf"
                  ? `${global.initializer.expr.name}+0`
                  : "0"
              : "0",
          },
        }
        : {
          bss: {
            label,
            directive: ".ds",
            value: "2",
          },
        };
    default:
      return {};
  }
}

function lowerGlobalArrayInitializer(initializer: BoundGlobalSymbol["initializer"], length: number): string {
  if (!initializer) {
    return Array.from({ length }, () => "0").join(",");
  }
  if (initializer.kind === "expr" && initializer.expr.kind === "string") {
    const values = Array.from(initializer.expr.value, (ch) => `${ch.charCodeAt(0)}`);
    if (values.length < length) {
      values.push("0");
    }
    while (values.length < length) {
      values.push("0");
    }
    return values.join(",");
  }
  if (initializer.kind === "list") {
    const values = initializer.items.map((item) =>
      item.kind === "expr" && item.expr.kind === "const" ? `${item.expr.value}` : "0");
    while (values.length < length) {
      values.push("0");
    }
    return values.join(",");
  }
  return Array.from({ length }, () => "0").join(",");
}

function lowerGlobalAggregateInitializer(
  name: string,
  type: Extract<SemanticType, { kind: "aggregate" }>,
  initializer?: BoundGlobalSymbol["initializer"],
): string {
  const values = flattenGlobalAggregateInitializer(name, type, initializer);
  return values.join(",");
}

function flattenGlobalAggregateInitializer(
  name: string,
  type: Extract<SourceType | SemanticType, { kind: "aggregate" }>,
  initializer?: BoundGlobalSymbol["initializer"],
): string[] {
  if (!initializer) {
    return Array.from({ length: "size" in type ? type.size : getAggregateLayoutSize(type) }, () => "0");
  }
  if (initializer.kind !== "list") {
    throw new Error(`Global aggregate initializer for '${name}' must be a brace list.`);
  }
  const values: string[] = [];
  const fields = getAggregateLayoutFields(type);
  for (const [index, field] of fields.entries()) {
    values.push(...flattenGlobalInitializerValue(`${name}.${field.name}`, field.type, initializer.items[index]));
  }
  return values;
}

function flattenGlobalInitializerValue(
  label: string,
  type: SourceType,
  initializer?: SourceInitializer,
): string[] {
  switch (type.kind) {
    case "void":
      throw new Error(`Global initializer cannot materialize void field '${label}'.`);
    case "scalar":
      return scalarInitializerBytes(type.name === "char" ? 1 : 2, initializerConstValue(label, initializer));
    case "pointer":
      return scalarInitializerBytes(2, initializerConstValue(label, initializer));
    case "aggregate":
      return flattenGlobalAggregateInitializer(label, type, initializer);
    case "array":
      throw new Error(`Global aggregate initializer does not yet support array field '${label}'.`);
    case "functionPointer":
      throw new Error(`Global aggregate initializer does not yet support function-pointer field '${label}'.`);
    default:
      return ["0"];
  }
}

function initializerConstValue(label: string, initializer?: SourceInitializer): number {
  if (!initializer) {
    return 0;
  }
  if (initializer.kind === "expr" && initializer.expr.kind === "const") {
    return initializer.expr.value;
  }
  if (initializer.kind === "list" && initializer.items.length === 0) {
    return 0;
  }
  if (initializer.kind === "list" && initializer.items.length === 1 && initializer.items[0]?.kind === "expr" && initializer.items[0].expr.kind === "const") {
    return initializer.items[0].expr.value;
  }
  throw new Error(`Global initializer for '${label}' must be a constant expression.`);
}

function scalarInitializerBytes(width: 1 | 2, value: number): string[] {
  if (width === 1) {
    return [`${value & 0xff}`];
  }
  return [`${value & 0xff}`, `${(value >> 8) & 0xff}`];
}

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
    case "returnVoid":
      return { kind: "returnVoid" };
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
  target: BoundLocalSymbol | BoundGlobalSymbol,
  source: BoundAggregateValueExpr,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh {
  const aggregateTarget = target as (BoundLocalSymbol | BoundGlobalSymbol) & { type: SemanticAggregateType };
  const thenBody = materializeAggregateProducer(
    source,
    aggregateTarget.kind === "local"
      ? { kind: "localSlot", slot: aggregateTarget.slot, type: aggregateTarget.type }
      : { kind: "globalSymbol", name: aggregateTarget.name, type: aggregateTarget.type },
    externs,
    definedFunctions,
    sourceText,
    state,
    functionState,
    file,
  );
  return {
    kind: "ifExprZero",
    expr: { kind: "const", value: 1 },
    thenBody,
    elseBody: [],
  };
}

type AggregateDestination =
  | { kind: "localSlot"; slot: number; type: SemanticAggregateType }
  | { kind: "globalSymbol"; name: string; type: SemanticAggregateType }
  | { kind: "returnSlot"; type: SemanticAggregateType };

function lowerAggregateAssignToGlobal(
  targetName: string,
  targetType: SemanticAggregateType,
  source: BoundAggregateValueExpr,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh[] {
  return materializeAggregateProducer(
    source,
    { kind: "globalSymbol", name: targetName, type: targetType },
    externs,
    definedFunctions,
    sourceText,
    state,
    functionState,
    file,
  );
}

function lowerAggregateCopyLocalSlotToGlobal(
  sourceSlot: number,
  targetName: string,
  targetType: SemanticAggregateType,
): StmtIRHigh[] {
  return getAggregateFieldStores(targetType).map((field) => ({
    kind: "evalExpr",
    expr: {
      kind: field.width === 1 ? "assignDerefByte" : "assignDerefWord",
      pointer: {
        kind: "pointerAdd",
        pointer: { kind: "globalAddress", name: targetName },
        index: { kind: "const", value: field.offset },
        scale: 1,
      },
      expr: {
        kind: field.width === 1 ? "derefByte" : "derefWord",
        pointer: {
          kind: "pointerAdd",
          pointer: { kind: "localAddress", slot: sourceSlot },
          index: { kind: "const", value: field.offset },
          scale: 1,
        },
      },
    },
  }));
}

function lowerAggregateCopyLocalSlotToLocalSlot(
  sourceSlot: number,
  targetSlot: number,
  targetType: SemanticAggregateType,
): StmtIRHigh[] {
  return getAggregateFieldStores(targetType).map((field) => ({
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
          pointer: { kind: "localAddress", slot: sourceSlot },
          index: { kind: "const", value: field.offset },
          scale: 1,
        },
      },
    },
  }));
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
  if (targetType.kind !== "aggregate") {
    throw new Error("Internal lowering error: aggregate assignment expected aggregate local target.");
  }
  return materializeAggregateProducer(
    source,
    { kind: "localSlot", slot: targetSlot, type: targetType },
    externs,
    definedFunctions,
    sourceText,
    state,
    functionState,
    file,
  );
}

function materializeAggregateProducer(
  source: BoundAggregateValueExpr,
  destination: AggregateDestination,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh[] {
  const aggregateType = destination.type;
  switch (source.kind) {
    case "aggregateRef":
      return lowerAggregateSourceAddressToDestination(
        lowerAggregateSourceAddressExpr(source.symbol, functionState),
        source.symbol.type,
        destination,
      );
    case "aggregateAssignExpr":
      if (source.target.kind === "local") {
        const effectDestination: AggregateDestination = {
          kind: "localSlot",
          slot: source.target.slot,
          type: source.target.type,
        };
        return [
          ...materializeAggregateProducer(source.source, effectDestination, externs, definedFunctions, sourceText, state, functionState, file),
          ...copyAggregateLocalSlotToDestination(source.target.slot, source.target.type, destination),
        ];
      }
      {
        const tempSlot = allocateTempLocal(functionState, source.type.size);
        return [
          ...materializeAggregateProducer(
            source.source,
            { kind: "localSlot", slot: tempSlot, type: source.target.type },
            externs,
            definedFunctions,
            sourceText,
            state,
            functionState,
            file,
          ),
          ...lowerAggregateCopyLocalSlotToGlobal(tempSlot, source.target.name, source.target.type),
          ...copyAggregateLocalSlotToDestination(tempSlot, source.target.type, destination),
        ];
      }
    case "comma":
      return [
        { kind: "evalExpr", expr: lowerExpr(source.left, externs, definedFunctions, sourceText, state, functionState, file) },
        ...materializeAggregateProducer(source.right, destination, externs, definedFunctions, sourceText, state, functionState, file),
      ];
    case "conditional":
      return [{
        kind: "ifExprZero",
        expr: lowerExpr(source.condition, externs, definedFunctions, sourceText, state, functionState, file),
        thenBody: materializeAggregateProducer(source.thenExpr, destination, externs, definedFunctions, sourceText, state, functionState, file),
        elseBody: materializeAggregateProducer(source.elseExpr, destination, externs, definedFunctions, sourceText, state, functionState, file),
      }];
    case "call":
      if (destination.kind === "localSlot") {
        return [lowerAggregateCallIntoLocalSlot(destination.slot, source, externs, definedFunctions, sourceText, state, functionState, file)];
      }
      {
        const tempSlot = allocateTempLocal(functionState, aggregateType.size);
        return [
          lowerAggregateCallIntoLocalSlot(tempSlot, source, externs, definedFunctions, sourceText, state, functionState, file),
          ...copyAggregateLocalSlotToDestination(tempSlot, aggregateType, destination),
        ];
      }
    default:
      return assertNever(source);
  }
}

function lowerAggregateSourceAddressToDestination(
  sourcePointer: ExprIR,
  sourceType: SemanticAggregateType,
  destination: AggregateDestination,
): StmtIRHigh[] {
  switch (destination.kind) {
    case "localSlot":
      return lowerAggregateCopySourceAddressToLocalSlot(sourcePointer, destination.slot, destination.type);
    case "globalSymbol":
      return lowerAggregateCopySourceAddressToGlobal(sourcePointer, destination.name, destination.type);
    case "returnSlot":
      return lowerAggregateCopySourceAddressToReturnSlot(sourcePointer, sourceType.size);
    default:
      return assertNever(destination);
  }
}

function copyAggregateLocalSlotToDestination(
  sourceSlot: number,
  sourceType: SemanticAggregateType,
  destination: AggregateDestination,
): StmtIRHigh[] {
  switch (destination.kind) {
    case "localSlot":
      return destination.slot === sourceSlot ? [] : lowerAggregateCopyLocalSlotToLocalSlot(sourceSlot, destination.slot, destination.type);
    case "globalSymbol":
      return lowerAggregateCopyLocalSlotToGlobal(sourceSlot, destination.name, destination.type);
    case "returnSlot":
      return lowerAggregateCopyLocalToReturnSlot(sourceSlot, sourceType.size);
    default:
      return assertNever(destination);
  }
}

function lowerAggregateCopySourceAddressToLocalSlot(
  sourcePointer: ExprIR,
  targetSlot: number,
  targetType: SemanticAggregateType,
): StmtIRHigh[] {
  const aggregateType = targetType;
  return getAggregateFieldStores(aggregateType).map((field) => ({
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
          pointer: sourcePointer,
          index: { kind: "const", value: field.offset },
          scale: 1,
        },
      },
    },
  }));
}

function lowerAggregateCopySourceAddressToGlobal(
  sourcePointer: ExprIR,
  targetName: string,
  targetType: SemanticAggregateType,
): StmtIRHigh[] {
  return getAggregateFieldStores(targetType).map((field) => ({
    kind: "evalExpr",
    expr: {
      kind: field.width === 1 ? "assignDerefByte" : "assignDerefWord",
      pointer: {
        kind: "pointerAdd",
        pointer: { kind: "globalAddress", name: targetName },
        index: { kind: "const", value: field.offset },
        scale: 1,
      },
      expr: {
        kind: field.width === 1 ? "derefByte" : "derefWord",
        pointer: {
          kind: "pointerAdd",
          pointer: sourcePointer,
          index: { kind: "const", value: field.offset },
          scale: 1,
        },
      },
    },
  }));
}

function lowerAggregateCopySourceAddressToReturnSlot(
  sourcePointer: ExprIR,
  size: number,
): StmtIRHigh[] {
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
          pointer: sourcePointer,
          index: { kind: "const" as const, value: index },
          scale: 1 as const,
        },
      },
    },
  }));
}

function lowerAggregateCallIntoLocalSlot(
  targetSlot: number,
  source: Extract<BoundAggregateValueExpr, { kind: "call" }>,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  functionState: FunctionLoweringState,
  file?: string,
): StmtIRHigh {
  return {
    kind: "evalExpr",
    expr: {
        kind: "call",
        target: source.target.name,
        args: [
          { kind: "expr", expr: { kind: "localAddress", slot: targetSlot } },
          ...source.args.map((arg) => isAggregateCallArg(arg)
            ? {
            kind: "aggregateConsumer" as const,
            consumer: {
              kind: "addressArg" as const,
              source: lowerAggregateValueExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
              tempSlot: allocateTempLocal(functionState, arg.type.size),
            },
          }
          : {
            kind: "expr" as const,
            expr: lowerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
          }),
        ],
    },
  };
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

function lowerAggregateCopyGlobalToReturnSlot(sourceName: string, size: number): StmtIRHigh[] {
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
          pointer: { kind: "globalAddress" as const, name: sourceName },
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
  return materializeAggregateProducer(
    source,
    { kind: "returnSlot", type: functionState.returnType as SemanticAggregateType },
    externs,
    definedFunctions,
    sourceText,
    state,
    functionState,
    file,
  );
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
  if (local.type.kind === "void" || local.type.kind === "array" || local.type.kind === "aggregate") {
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
  if (param.type.kind === "void") {
    throw new Error(`Internal lowering error: expected non-void param, got ${JSON.stringify(param.type)}`);
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
    case "functionAddress":
      return { kind: "dataAddress", label: expr.name };
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
            : expr.symbol.type.kind === "void"
              ? (() => {
                throw new Error(`Internal lowering error: void parameter values are not supported, got ${JSON.stringify(expr.symbol.type)}`);
              })()
              : expr.symbol.type.kind === "functionPointer"
                ? expr.symbol.type.width
                : expr.symbol.type.width,
        slot: expr.symbol.kind === "local" ? expr.symbol.slot : getParamIrSlot(expr.symbol.slot, functionState),
      } satisfies RefIR;
    case "globalRef":
      return {
        kind: "globalRef",
        name: expr.symbol.name,
        width: expr.type.width,
      };
    case "localAddress":
      return {
        kind: "localAddress",
        slot: expr.symbol.slot,
      };
    case "globalAddress":
      return {
        kind: "globalAddress",
        name: expr.symbol.name,
      };
    case "aggregateFieldAccess":
      return {
        kind: expr.type.width === 1 ? "derefByte" : "derefWord",
        pointer: {
          kind: "pointerAdd",
          pointer: expr.symbol.kind === "local"
            ? { kind: "localAddress", slot: expr.symbol.slot }
            : expr.symbol.kind === "global"
              ? { kind: "globalAddress", name: expr.symbol.name }
              : { kind: "ref", scope: "arg", width: 2, slot: getParamIrSlot(expr.symbol.slot, functionState) },
          index: { kind: "const", value: expr.offset },
          scale: 1,
        },
      };
    case "aggregateValueFieldAccess": {
      const tempSlot = allocateTempLocal(functionState, expr.source.type.size);
      return {
        kind: "aggregateConsumer",
        consumer: {
          kind: "fieldRead",
          source: lowerAggregateValueExpr(expr.source, externs, definedFunctions, sourceText, state, functionState, file),
          tempSlot,
          offset: expr.offset,
          width: expr.type.width,
        },
      };
    }
    case "aggregateValueFieldAddress": {
      const tempSlot = allocateTempLocal(functionState, expr.source.type.size);
      return {
        kind: "aggregateConsumer",
        consumer: {
          kind: "fieldAddress",
          source: lowerAggregateValueExpr(expr.source, externs, definedFunctions, sourceText, state, functionState, file),
          tempSlot,
          offset: expr.offset,
        },
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
    case "globalArrayElement":
      return {
        kind: "globalArrayElement",
        name: expr.symbol.name,
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
            kind: "aggregateConsumer",
            consumer: {
              kind: "addressArg",
              source: lowerAggregateValueExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
              tempSlot: allocateTempLocal(functionState, arg.type.size),
            },
          }
          : {
            kind: "expr",
            expr: lowerExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
          }),
      };
    case "indirectCall":
      return {
        kind: "indirectCall",
        target: lowerExpr(expr.target, externs, definedFunctions, sourceText, state, functionState, file),
        args: expr.args.map((arg) => isAggregateCallArg(arg)
          ? {
            kind: "aggregateConsumer",
            consumer: {
              kind: "addressArg",
              source: lowerAggregateValueExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
              tempSlot: allocateTempLocal(functionState, arg.type.size),
            },
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
    case "assignGlobal":
      return {
        kind: "assignGlobal",
        name: expr.global.name,
        width: expr.type.width,
        expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "arrayAssignExpr":
      return {
        kind: expr.target.kind === "param" ? "assignArgArray" : "assignLocalArray",
        slot: expr.target.slot,
        index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
        expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "globalArrayAssignExpr":
      return {
        kind: "assignGlobalArray",
        name: expr.target.name,
        index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, functionState, file),
        expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
      };
    case "cast":
      if (expr.type.kind === "scalar" && expr.type.width === 1) {
        const tempSlot = allocateTempLocal(functionState, 1);
        return {
          kind: "comma",
          left: {
            kind: "assignLocal",
            slot: tempSlot,
            width: 1,
            expr: lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file),
          },
          right: {
            kind: "ref",
            scope: "local",
            width: 1,
            slot: tempSlot,
          },
        };
      }
      return lowerExpr(expr.expr, externs, definedFunctions, sourceText, state, functionState, file);
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
      return expr.symbol.kind === "global"
        ? {
          kind: "aggregateRef",
          scope: "global",
          slot: expr.symbol.name,
          size: expr.type.size,
        }
        : {
          kind: "aggregateRef",
          scope: expr.symbol.kind === "local" ? "local" : "arg",
          slot: expr.symbol.kind === "local" ? expr.symbol.slot : getParamIrSlot(expr.symbol.slot, functionState),
          size: expr.type.size,
        };
    case "aggregateAssignExpr":
      return {
        kind: "aggregateAssignExpr",
        effectTarget: expr.target.kind === "local"
          ? { scope: "local", slot: expr.target.slot }
          : { scope: "global", name: expr.target.name },
        valueSlot: expr.target.kind === "local" ? expr.target.slot : allocateTempLocal(functionState, expr.type.size),
        source: lowerAggregateValueExpr(expr.source, externs, definedFunctions, sourceText, state, functionState, file),
        size: expr.type.size,
      };
    case "call":
      return {
        kind: "call",
        target: expr.target.name,
        args: expr.args.map((arg) => isAggregateCallArg(arg)
          ? {
            kind: "aggregateConsumer",
            consumer: {
              kind: "addressArg",
              source: lowerAggregateValueExpr(arg, externs, definedFunctions, sourceText, state, functionState, file),
              tempSlot: allocateTempLocal(functionState, arg.type.size),
            },
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

function lowerAggregateSourceAddressExpr(
  symbol: (BoundLocalSymbol | BoundParamSymbol | BoundGlobalSymbol) & { type: SemanticAggregateType },
  functionState: FunctionLoweringState,
): ExprIR {
  if (symbol.kind === "local") {
    return { kind: "localAddress", slot: symbol.slot };
  }
  if (symbol.kind === "param") {
    return { kind: "ref", scope: "arg", width: 2, slot: getParamIrSlot(symbol.slot, functionState) };
  }
  return { kind: "globalAddress", name: symbol.name };
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

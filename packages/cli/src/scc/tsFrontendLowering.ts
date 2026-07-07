import {
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

function lowerFunction(
  fn: BoundFunction,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  file?: string,
) {
  const body = lowerBlock(fn.body, externs, definedFunctions, sourceText, state, file);
  const functionIr: FunctionIR = {
    name: fn.name,
    params: fn.params.map((param) => param.type.width),
    locals: fn.locals.map((local) => local.storageBytes),
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
  file?: string,
): StmtIRHigh[] {
  return block.statements.map((stmt) => lowerStmt(stmt, externs, definedFunctions, sourceText, state, file));
}

function lowerStmt(
  stmt: BoundStmt,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  file?: string,
): StmtIRHigh {
  switch (stmt.kind) {
    case "return":
      return { kind: "returnExpr", expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, file) };
    case "expr":
      return { kind: "evalExpr", expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, file) };
    case "if":
      return {
        kind: "ifExprZero",
        expr: lowerExpr(stmt.condition, externs, definedFunctions, sourceText, state, file),
        thenBody: lowerBlock(stmt.thenBlock, externs, definedFunctions, sourceText, state, file),
        elseBody: stmt.elseBlock ? lowerBlock(stmt.elseBlock, externs, definedFunctions, sourceText, state, file) : [],
      };
    case "while": {
      return {
        kind: "whileExprNonZero",
        expr: lowerExpr(stmt.condition, externs, definedFunctions, sourceText, state, file),
        body: lowerBlock(stmt.body, externs, definedFunctions, sourceText, state, file),
      };
    }
    case "doWhile":
      return {
        kind: "doWhileExprNonZero",
        body: lowerBlock(stmt.body, externs, definedFunctions, sourceText, state, file),
        expr: lowerExpr(stmt.condition, externs, definedFunctions, sourceText, state, file),
      };
    case "for":
      return lowerForStmt(stmt, externs, definedFunctions, sourceText, state, file);
    case "switch":
      externs.add(".eq");
      return {
        kind: "switchExpr",
        expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, file),
        cases: stmt.cases.map((entry) => ({
          value: entry.value,
          body: lowerBlock(entry.body, externs, definedFunctions, sourceText, state, file),
        })),
        defaultBody: stmt.defaultCase ? lowerBlock(stmt.defaultCase, externs, definedFunctions, sourceText, state, file) : [],
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
          width: getScalarLocalWidth(stmt.local),
          value: stmt.expr.value,
        };
      }
      return {
        kind: "assignLocalExpr",
        slot: stmt.local.slot,
        width: getScalarLocalWidth(stmt.local),
        expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, file),
      };
    }
    case "arrayAssign":
      if (stmt.index.kind === "const" && stmt.expr.kind === "const") {
        return {
          kind: "assignLocalArrayConst",
          slot: stmt.local.slot,
          index: stmt.index.value,
          value: stmt.expr.value,
        };
      }
      if (stmt.index.kind === "const") {
        return {
          kind: "assignLocalArrayExpr",
          slot: stmt.local.slot,
          index: stmt.index.value,
          expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, file),
        };
      }
      return {
        kind: "assignLocalArrayDynamic",
        slot: stmt.local.slot,
        index: lowerExpr(stmt.index, externs, definedFunctions, sourceText, state, file),
        expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, file),
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
  file?: string,
): StmtIRHigh {
  const loopBody = lowerBlock(stmt.body, externs, definedFunctions, sourceText, state, file);
  const init = stmt.initializer ? lowerForInit(stmt.initializer, externs, definedFunctions, sourceText, state, file) : undefined;
  const step = stmt.step ? lowerSimpleStmt(stmt.step, externs, definedFunctions, sourceText, state, file) : undefined;
  const loopStmt: StmtIRHigh = {
    kind: "whileExprNonZero",
    expr: stmt.condition
      ? lowerExpr(stmt.condition, externs, definedFunctions, sourceText, state, file)
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
  file?: string,
): StmtIRHigh {
  if (init.kind !== "localDecl") {
    return lowerSimpleStmt(init, externs, definedFunctions, sourceText, state, file);
  }
  if (!init.initializer) {
    return { kind: "evalExpr", expr: { kind: "const", value: 0 } };
  }
  if (init.initializer.kind === "const") {
    return {
      kind: "assignLocalConst",
      slot: init.local.slot,
      width: getScalarLocalWidth(init.local),
      value: init.initializer.value,
    };
  }
  return {
    kind: "assignLocalExpr",
    slot: init.local.slot,
    width: getScalarLocalWidth(init.local),
    expr: lowerExpr(init.initializer, externs, definedFunctions, sourceText, state, file),
  };
}

function lowerSimpleStmt(
  stmt: BoundSimpleStmt,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
  file?: string,
): StmtIRHigh {
  if (stmt.kind === "expr") {
    return { kind: "evalExpr", expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, file) };
  }
  if (stmt.kind === "arrayAssign") {
    if (stmt.index.kind === "const" && stmt.expr.kind === "const") {
      return {
        kind: "assignLocalArrayConst",
        slot: stmt.local.slot,
        index: stmt.index.value,
        value: stmt.expr.value,
      };
    }
    if (stmt.index.kind === "const") {
      return {
        kind: "assignLocalArrayExpr",
        slot: stmt.local.slot,
        index: stmt.index.value,
        expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, file),
      };
    }
    return {
      kind: "assignLocalArrayDynamic",
      slot: stmt.local.slot,
      index: lowerExpr(stmt.index, externs, definedFunctions, sourceText, state, file),
      expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, file),
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
      width: getScalarLocalWidth(stmt.local),
      value: stmt.expr.value,
    };
  }
  return {
    kind: "assignLocalExpr",
    slot: stmt.local.slot,
    width: getScalarLocalWidth(stmt.local),
    expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, state, file),
  };
}

function tryLowerDecLocalByte(stmt: Extract<BoundStmt, { kind: "assign" }> | BoundSimpleStmt & { kind: "assign" }): StmtIRHigh | null {
  if (getScalarLocalWidth(stmt.local) !== 1 || stmt.expr.kind !== "additive" || stmt.expr.op !== "-" || stmt.expr.right.kind !== "const" || stmt.expr.right.value !== 1) {
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

function lowerExpr(
  expr: BoundExpr,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  state: LoweringState,
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
        width: expr.symbol.kind === "local" ? getScalarLocalWidth(expr.symbol) : expr.symbol.type.width,
        slot: expr.symbol.slot,
      } satisfies RefIR;
    case "localAddress":
      return {
        kind: "localAddress",
        slot: expr.symbol.slot,
      };
    case "localArrayElement":
      return {
        kind: "localArrayElement",
        slot: expr.symbol.slot,
        index: lowerExpr(expr.index, externs, definedFunctions, sourceText, state, file),
      };
    case "compare": {
      const helper = compareOpToHelper(expr.op);
      externs.add(helper);
      return {
        kind: "compare",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, file),
        helper,
      };
    }
    case "logical":
      return {
        kind: "logical",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, file),
        op: expr.op,
      };
    case "bitwise":
      return {
        kind: "bitwise",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, file),
        op: expr.op,
      };
    case "shift": {
      const helper = expr.op === "<<" ? ".asl" : ".asr";
      externs.add(helper);
      return {
        kind: "helperBinary",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, file),
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
        args: expr.args.map((arg) => lowerExpr(arg, externs, definedFunctions, sourceText, state, file)),
      };
    case "additive":
      return {
        kind: "additive",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, file),
        op: expr.op,
      };
    case "multiplicative":
      if (expr.op === "*") {
        externs.add(".mul");
        return {
          kind: "helperBinary",
          left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, file),
          right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, file),
          helper: ".mul",
        };
      }
      externs.add(".div");
      return {
        kind: "divmod",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, state, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, state, file),
        result: expr.op === "/" ? "quotient" : "remainder",
      };
    default:
      return assertNever(expr);
  }
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

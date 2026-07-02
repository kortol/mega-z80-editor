import { throwDiagnostic } from "./tsFrontendDiagnostics";
import {
  BoundBlock,
  BoundExpr,
  BoundFunction,
  BoundProgram,
  BoundStmt,
} from "./tsFrontendSemantic";
import {
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
  const functions = program.functions.map((fn) => lowerFunction(fn, externs, definedFunctions, sourceText, file));
  return {
    moduleName,
    exports: definedFunctions.has("main") ? ["main"] : [],
    externs: Array.from(externs),
    functions,
    includeBss: true,
  };
}

function lowerFunction(
  fn: BoundFunction,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  file?: string,
) {
  const body = lowerBlock(fn.body, externs, definedFunctions, sourceText, file);
  const functionIr: FunctionIR = {
    name: fn.name,
    params: fn.params.map((param) => param.type.width),
    locals: fn.locals.map((local) => local.type.width),
    body,
  };
  return lowerFunctionIR(functionIr);
}

function lowerBlock(
  block: BoundBlock,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  file?: string,
): StmtIRHigh[] {
  return block.statements.map((stmt) => lowerStmt(stmt, externs, definedFunctions, sourceText, file));
}

function lowerStmt(
  stmt: BoundStmt,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  file?: string,
): StmtIRHigh {
  switch (stmt.kind) {
    case "return":
      return { kind: "returnExpr", expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, file) };
    case "if":
      return {
        kind: "ifExprZero",
        expr: lowerExpr(stmt.condition, externs, definedFunctions, sourceText, file),
        thenBody: lowerBlock(stmt.thenBlock, externs, definedFunctions, sourceText, file),
        elseBody: stmt.elseBlock ? lowerBlock(stmt.elseBlock, externs, definedFunctions, sourceText, file) : [],
      };
    case "while": {
      const loweredCondition = lowerExpr(stmt.condition, externs, definedFunctions, sourceText, file);
      return {
        kind: "ifExprZero",
        expr: loweredCondition,
        thenBody: [{
          kind: "doWhileExprNonZero",
          body: lowerBlock(stmt.body, externs, definedFunctions, sourceText, file),
          expr: loweredCondition,
        }],
        elseBody: [],
      };
    }
    case "assign": {
      if (stmt.expr.kind === "const") {
        return {
          kind: "assignLocalConst",
          slot: stmt.local.slot,
          width: stmt.local.type.width,
          value: stmt.expr.value,
        };
      }
      return {
        kind: "assignLocalExpr",
        slot: stmt.local.slot,
        width: stmt.local.type.width,
        expr: lowerExpr(stmt.expr, externs, definedFunctions, sourceText, file),
      };
    }
    default:
      return assertNever(stmt);
  }
}

function lowerExpr(
  expr: BoundExpr,
  externs: Set<string>,
  definedFunctions: Set<string>,
  sourceText: string,
  file?: string,
): ExprIR {
  switch (expr.kind) {
    case "const":
      return { kind: "const", value: expr.value };
    case "ref":
      return {
        kind: "ref",
        scope: expr.symbol.kind === "local" ? "local" : "arg",
        width: expr.symbol.type.width,
        slot: expr.symbol.slot,
      } satisfies RefIR;
    case "compare": {
      const helper = compareOpToHelper(expr.op);
      externs.add(helper);
      return {
        kind: "compare",
        left: lowerExpr(expr.left, externs, definedFunctions, sourceText, file),
        right: lowerExpr(expr.right, externs, definedFunctions, sourceText, file),
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
        args: expr.args.map((arg) => lowerExpr(arg, externs, definedFunctions, sourceText, file)),
      };
    case "additive":
      throwDiagnostic(
        sourceText,
        `TsSccCompilerAdapter Phase C subset parsed '${expr.op}' but lowering is not implemented yet.`,
        { file, offset: 0 },
      );
    default:
      return assertNever(expr);
  }
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

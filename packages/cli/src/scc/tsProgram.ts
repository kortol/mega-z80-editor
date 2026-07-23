export type ValueWidth = 1 | 2;

export type ProgramSpec = {
  moduleName: string;
  exports?: string[];
  externs?: string[];
  data?: DataSpec[];
  functions: FunctionSpec[];
  includeBss?: boolean;
};

export type AggregateValueSpec =
  | { kind: "aggregateRef"; scope: "local" | "arg"; offset: number; size: number }
  | { kind: "aggregateAssignExpr"; targetOffset: number; source: AggregateValueSpec; size: number }
  | { kind: "call"; target: string; args?: CallArgSpec[]; size: number }
  | { kind: "comma"; left: ExprSpec; right: AggregateValueSpec; size: number }
  | { kind: "conditional"; condition: ExprSpec; thenExpr: AggregateValueSpec; elseExpr: AggregateValueSpec; size: number };

export type CallArgSpec =
  | { kind: "expr"; expr: ExprSpec }
  | { kind: "aggregateAddress"; source: AggregateValueSpec; tempOffset: number };

export type ExprSpec =
  | { kind: "const"; value: number }
  | { kind: "dataAddress"; label: string }
  | { kind: "localAddress"; offset: number }
  | { kind: "localArrayElement"; offset: number }
  | { kind: "localArrayElementExpr"; offset: number; index: ExprSpec }
  | { kind: "argArrayElement"; offset: number; index: ExprSpec }
  | { kind: "pointerAdd"; pointer: ExprSpec; index: ExprSpec; scale: 1 | 2 }
  | { kind: "derefByte"; pointer: ExprSpec }
  | { kind: "derefWord"; pointer: ExprSpec }
  | { kind: "assignDerefByte"; pointer: ExprSpec; expr: ExprSpec }
  | { kind: "assignDerefWord"; pointer: ExprSpec; expr: ExprSpec }
  | { kind: "incDecDeref"; pointer: ExprSpec; width: ValueWidth; op: "++" | "--"; mode: "prefix" | "postfix" }
  | { kind: "call"; target: string; args?: CallArgSpec[] }
  | { kind: "incDecLocal"; offset: number; width: ValueWidth; step: 1 | 2; op: "++" | "--"; mode: "prefix" | "postfix" }
  | { kind: "incDecLocalArray"; offset: number; index: ExprSpec; op: "++" | "--"; mode: "prefix" | "postfix" }
  | { kind: "incDecArgArray"; offset: number; index: ExprSpec; op: "++" | "--"; mode: "prefix" | "postfix" }
  | { kind: "assignLocal"; offset: number; width: ValueWidth; expr: ExprSpec }
  | { kind: "assignLocalArray"; offset: number; index: ExprSpec; expr: ExprSpec }
  | { kind: "assignArgArray"; offset: number; index: ExprSpec; expr: ExprSpec }
  | { kind: "comma"; left: ExprSpec; right: ExprSpec }
  | { kind: "conditional"; condition: ExprSpec; thenExpr: ExprSpec; elseExpr: ExprSpec }
  | { kind: "logical"; left: ExprSpec; right: ExprSpec; op: "&&" | "||" }
  | { kind: "bitwise"; left: ExprSpec; right: ExprSpec; op: "&" | "^" | "|" }
  | { kind: "helperBinary"; left: ExprSpec; right: ExprSpec; helper: ".mul" | ".asl" | ".asr" }
  | { kind: "divmod"; left: ExprSpec; right: ExprSpec; result: "quotient" | "remainder" }
  | { kind: "compare"; left: ExprSpec; right: ExprSpec; helper: string }
  | { kind: "additive"; left: ExprSpec; right: ExprSpec; op: "+" | "-" }
  | { kind: "aggregateValueFieldAccess"; source: AggregateValueSpec; tempOffset: number; offset: number; width: ValueWidth }
  | { kind: "aggregateValueFieldAddress"; source: AggregateValueSpec; tempOffset: number; offset: number }
  | { kind: "localChar"; offset: number }
  | { kind: "localInt"; offset: number }
  | { kind: "argChar"; offset: number }
  | { kind: "argInt"; offset: number };

export type FunctionSpec = {
  name: string;
  statements: StatementSpec[];
};

export type DataSpec = {
  label: string;
  directive: ".ascii" | ".asciz" | ".db" | ".dw" | ".ds";
  value: string;
};

export type RefIR = {
  kind: "ref";
  scope: "local" | "arg";
  width: ValueWidth;
  slot: number;
};

export type AggregateValueIR =
  | { kind: "aggregateRef"; scope: "local" | "arg"; slot: number; size: number }
  | { kind: "aggregateAssignExpr"; targetSlot: number; source: AggregateValueIR; size: number }
  | { kind: "call"; target: string; args?: CallArgIR[]; size: number }
  | { kind: "comma"; left: ExprIR; right: AggregateValueIR; size: number }
  | { kind: "conditional"; condition: ExprIR; thenExpr: AggregateValueIR; elseExpr: AggregateValueIR; size: number };

export type CallArgIR =
  | { kind: "expr"; expr: ExprIR }
  | { kind: "aggregateAddress"; source: AggregateValueIR; tempSlot: number };

export type ExprIR =
  | { kind: "const"; value: number }
  | { kind: "dataAddress"; label: string }
  | { kind: "localAddress"; slot: number }
  | { kind: "localArrayElement"; slot: number; index: ExprIR }
  | { kind: "argArrayElement"; slot: number; index: ExprIR }
  | { kind: "pointerAdd"; pointer: ExprIR; index: ExprIR; scale: 1 | 2 }
  | { kind: "derefByte"; pointer: ExprIR }
  | { kind: "derefWord"; pointer: ExprIR }
  | { kind: "assignDerefByte"; pointer: ExprIR; expr: ExprIR }
  | { kind: "assignDerefWord"; pointer: ExprIR; expr: ExprIR }
  | { kind: "incDecDeref"; pointer: ExprIR; width: ValueWidth; op: "++" | "--"; mode: "prefix" | "postfix" }
  | RefIR
  | { kind: "incDecLocal"; slot: number; width: ValueWidth; step: 1 | 2; op: "++" | "--"; mode: "prefix" | "postfix" }
  | { kind: "incDecLocalArray"; slot: number; index: ExprIR; op: "++" | "--"; mode: "prefix" | "postfix" }
  | { kind: "incDecArgArray"; slot: number; index: ExprIR; op: "++" | "--"; mode: "prefix" | "postfix" }
  | { kind: "assignLocal"; slot: number; width: ValueWidth; expr: ExprIR }
  | { kind: "assignLocalArray"; slot: number; index: ExprIR; expr: ExprIR }
  | { kind: "assignArgArray"; slot: number; index: ExprIR; expr: ExprIR }
  | { kind: "comma"; left: ExprIR; right: ExprIR }
  | { kind: "conditional"; condition: ExprIR; thenExpr: ExprIR; elseExpr: ExprIR }
  | { kind: "logical"; left: ExprIR; right: ExprIR; op: "&&" | "||" }
  | { kind: "bitwise"; left: ExprIR; right: ExprIR; op: "&" | "^" | "|" }
  | { kind: "helperBinary"; left: ExprIR; right: ExprIR; helper: ".mul" | ".asl" | ".asr" }
  | { kind: "divmod"; left: ExprIR; right: ExprIR; result: "quotient" | "remainder" }
  | { kind: "compare"; left: ExprIR; right: ExprIR; helper: string }
  | { kind: "additive"; left: ExprIR; right: ExprIR; op: "+" | "-" }
  | { kind: "aggregateValueFieldAccess"; source: AggregateValueIR; tempSlot: number; offset: number; width: ValueWidth }
  | { kind: "aggregateValueFieldAddress"; source: AggregateValueIR; tempSlot: number; offset: number }
  | { kind: "call"; target: string; args?: CallArgIR[] };

export type FunctionIR = {
  name: string;
  params: ValueWidth[];
  locals: number[];
  body: StmtIRHigh[];
};

export type StmtIRHigh =
  | { kind: "materializeAggregateValue"; targetSlot: number; source: AggregateValueIR }
  | { kind: "assignLocalConst"; slot: number; width: ValueWidth; value: number }
  | { kind: "assignLocalExpr"; slot: number; width: ValueWidth; expr: ExprIR }
  | { kind: "assignLocalArrayConst"; slot: number; index: number; value: number }
  | { kind: "assignLocalArrayExpr"; slot: number; index: number; expr: ExprIR }
  | { kind: "assignLocalArrayDynamic"; slot: number; index: ExprIR; expr: ExprIR }
  | { kind: "assignArgArrayDynamic"; slot: number; index: ExprIR; expr: ExprIR }
  | { kind: "compareReturn"; left: ExprIR; right: ExprIR; helper: string }
  | { kind: "returnExpr"; expr: ExprIR }
  | { kind: "evalExpr"; expr: ExprIR }
  | { kind: "returnVoid" }
  | { kind: "emitExprChar"; expr: ExprIR }
  | { kind: "callModeAArg"; target: string; mode: number; expr: ExprIR }
  | { kind: "decLocalByte"; slot: number }
  | { kind: "emitChar"; value: number }
  | { kind: "whileExprNonZero"; expr: ExprIR; body: StmtIRHigh[]; stepBody?: StmtIRHigh[] }
  | { kind: "doWhileExprNonZero"; body: StmtIRHigh[]; expr: ExprIR }
  | { kind: "switchExpr"; expr: ExprIR; cases: Array<{ value: number; body: StmtIRHigh[] }>; defaultBody: StmtIRHigh[] }
  | { kind: "break" }
  | { kind: "continue" }
  | { kind: "ifExprZero"; expr: ExprIR; thenBody: StmtIRHigh[]; elseBody: StmtIRHigh[] };

type FunctionLayout = {
  localBytes: number;
  localOffsets: number[];
  paramOffsets: number[];
};

type LoweringState = {
  nextLabelId: number;
  labelPrefix: string;
};

type LoopContext = {
  breakLabel: string;
  continueLabel?: string;
};

type StatementSpec =
  | { kind: "materializeAggregateValue"; targetOffset: number; source: AggregateValueSpec }
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
  | { kind: "storeExprToLocalArrayByte"; offset: number; index: ExprSpec; expr: ExprSpec }
  | { kind: "storeExprToArgArrayByte"; offset: number; index: ExprSpec; expr: ExprSpec }
  | { kind: "loadLocalCharToHl"; offset: number }
  | { kind: "storeImm16ToLocal"; offset: number; value: number }
  | { kind: "storeExprToLocalWord"; offset: number; expr: ExprSpec }
  | { kind: "loadLocalIntToHl"; offset: number }
  | { kind: "decLocalByte"; offset: number }
  | { kind: "compareExprHelper"; left: ExprSpec; right: ExprSpec; helper: string };

type EmitExprContext = {
  stackDelta: number;
  labels: {
    nextLogicalLabelId: number;
    labelPrefix: string;
  };
};

export function emitProgram(spec: ProgramSpec): string {
  const lines: string[] = [];
  for (const exp of spec.exports ?? []) {
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

export function lowerFunctionIR(fn: FunctionIR): FunctionSpec {
  const layout = layoutFunction(fn);
  const state: LoweringState = { nextLabelId: 2, labelPrefix: fn.name };
  const statements: StatementSpec[] = [];
  if (layout.localBytes > 0) {
    statements.push({ kind: "reserveBytes", count: layout.localBytes });
  }
  for (const stmt of fn.body) {
    statements.push(...lowerStmtIR(stmt, layout, state));
  }
  return { name: fn.name, statements };
}

function lowerStmtIR(stmt: StmtIRHigh, layout: FunctionLayout, state: LoweringState, loop?: LoopContext): StatementSpec[] {
  switch (stmt.kind) {
    case "materializeAggregateValue":
      return [{
        kind: "materializeAggregateValue",
        targetOffset: getLocalOffset(layout, stmt.targetSlot),
        source: lowerAggregateValueIR(stmt.source, layout),
      }];
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
    case "assignLocalArrayConst":
      return [{ kind: "storeImmToLocal", offset: getLocalOffset(layout, stmt.slot) + stmt.index, value: stmt.value }];
    case "assignLocalArrayExpr":
      return [{
        kind: "storeExprToLocalByte",
        offset: getLocalOffset(layout, stmt.slot) + stmt.index,
        expr: lowerExprIR(stmt.expr, layout),
      }];
    case "assignLocalArrayDynamic":
      return [{
        kind: "storeExprToLocalArrayByte",
        offset: getLocalOffset(layout, stmt.slot),
        index: lowerExprIR(stmt.index, layout),
        expr: lowerExprIR(stmt.expr, layout),
      }];
    case "assignArgArrayDynamic":
      return [{
        kind: "storeExprToArgArrayByte",
        offset: getParamOffset(layout, stmt.slot),
        index: lowerExprIR(stmt.index, layout),
        expr: lowerExprIR(stmt.expr, layout),
      }];
    case "compareReturn": {
      const statements: StatementSpec[] = [{
        kind: "compareExprHelper",
        left: lowerExprIR(stmt.left, layout),
        right: lowerExprIR(stmt.right, layout),
        helper: stmt.helper,
      }];
      if (layout.localBytes > 0) {
        statements.push({ kind: "releaseBytes", count: layout.localBytes });
      }
      statements.push({ kind: "ret" });
      return statements;
    }
    case "returnExpr": {
      const statements: StatementSpec[] = [{ kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) }];
      if (layout.localBytes > 0) {
        statements.push({ kind: "releaseBytes", count: layout.localBytes });
      }
      statements.push({ kind: "ret" });
      return statements;
    }
    case "evalExpr":
      return [{ kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) }];
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
    case "whileExprNonZero": {
      const loopLabel = allocateNumericLabel(state);
      const continueLabel = allocateNumericLabel(state);
      const endLabel = allocateNumericLabel(state);
      const loopContext: LoopContext = { breakLabel: endLabel, continueLabel };
      return [
        { kind: "label", name: loopLabel },
        { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
        { kind: "truthJumpZero", target: endLabel },
        ...stmt.body.flatMap((entry) => lowerStmtIR(entry, layout, state, loopContext)),
        { kind: "label", name: continueLabel },
        ...(stmt.stepBody ?? []).flatMap((entry) => lowerStmtIR(entry, layout, state, loopContext)),
        { kind: "jump", target: loopLabel },
        { kind: "label", name: endLabel },
      ];
    }
    case "doWhileExprNonZero": {
      const loopLabel = allocateNumericLabel(state);
      const continueLabel = allocateNumericLabel(state);
      const endLabel = allocateNumericLabel(state);
      const loopContext: LoopContext = { breakLabel: endLabel, continueLabel };
      return [
        { kind: "label", name: loopLabel },
        ...stmt.body.flatMap((entry) => lowerStmtIR(entry, layout, state, loopContext)),
        { kind: "label", name: continueLabel },
        { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
        { kind: "truthJumpZero", target: endLabel },
        { kind: "jump", target: loopLabel },
        { kind: "label", name: endLabel },
      ];
    }
    case "switchExpr": {
      const endLabel = allocateNumericLabel(state);
      const defaultLabel = stmt.defaultBody.length > 0 ? allocateNumericLabel(state) : endLabel;
      const caseLabels = stmt.cases.map(() => allocateNumericLabel(state));
      const nextCompareLabels = stmt.cases.map((_, index) => index === stmt.cases.length - 1 ? defaultLabel : allocateNumericLabel(state));
      const switchContext: LoopContext = { breakLabel: endLabel };
      const dispatch: StatementSpec[] = stmt.cases.flatMap((entry, index) => [
        {
          kind: "compareExprHelper",
          left: lowerExprIR(stmt.expr, layout),
          right: { kind: "const", value: entry.value },
          helper: ".eq",
        } satisfies StatementSpec,
        { kind: "truthJumpZero", target: nextCompareLabels[index] },
        { kind: "jump", target: caseLabels[index] },
        ...(nextCompareLabels[index] === defaultLabel ? [] : [{ kind: "label", name: nextCompareLabels[index] } satisfies StatementSpec]),
      ]);
      const bodies: StatementSpec[] = [];
      for (const [index, entry] of stmt.cases.entries()) {
        bodies.push({ kind: "label", name: caseLabels[index] });
        bodies.push(...entry.body.flatMap((bodyStmt) => lowerStmtIR(bodyStmt, layout, state, switchContext)));
      }
      if (stmt.defaultBody.length > 0) {
        bodies.push({ kind: "label", name: defaultLabel });
        bodies.push(...stmt.defaultBody.flatMap((bodyStmt) => lowerStmtIR(bodyStmt, layout, state, switchContext)));
      }
      bodies.push({ kind: "label", name: endLabel });
      return [...dispatch, ...bodies];
    }
    case "break":
      if (!loop) {
        throw new Error("Internal lowering error: break used outside loop context.");
      }
      return [{ kind: "jump", target: loop.breakLabel }];
    case "continue":
      if (!loop?.continueLabel) {
        throw new Error("Internal lowering error: continue used outside loop context.");
      }
      return [{ kind: "jump", target: loop.continueLabel }];
    case "ifExprZero": {
      const elseLabel = allocateNumericLabel(state);
      const endLabel = allocateNumericLabel(state);
      return [
        { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
        { kind: "truthJumpZero", target: elseLabel },
        ...stmt.thenBody.flatMap((entry) => lowerStmtIR(entry, layout, state, loop)),
        { kind: "jump", target: endLabel },
        { kind: "label", name: elseLabel },
        ...stmt.elseBody.flatMap((entry) => lowerStmtIR(entry, layout, state, loop)),
        { kind: "label", name: endLabel },
      ];
    }
    default:
      return assertNever(stmt);
  }
}

function allocateNumericLabel(state: LoweringState): string {
  const label = `.${state.labelPrefix}_${state.nextLabelId}`;
  state.nextLabelId += 1;
  return label;
}

function lowerExprIR(expr: ExprIR, layout: FunctionLayout): ExprSpec {
  switch (expr.kind) {
    case "const":
      return { kind: "const", value: expr.value };
    case "dataAddress":
      return { kind: "dataAddress", label: expr.label };
    case "localAddress":
      return { kind: "localAddress", offset: getLocalOffset(layout, expr.slot) };
    case "localArrayElement":
      if (expr.index.kind === "const") {
        return { kind: "localArrayElement", offset: getLocalOffset(layout, expr.slot) + expr.index.value };
      }
      return { kind: "localArrayElementExpr", offset: getLocalOffset(layout, expr.slot), index: lowerExprIR(expr.index, layout) };
    case "argArrayElement":
      return { kind: "argArrayElement", offset: getParamOffset(layout, expr.slot), index: lowerExprIR(expr.index, layout) };
    case "pointerAdd":
      return { kind: "pointerAdd", pointer: lowerExprIR(expr.pointer, layout), index: lowerExprIR(expr.index, layout), scale: expr.scale };
    case "derefByte":
      return { kind: "derefByte", pointer: lowerExprIR(expr.pointer, layout) };
    case "derefWord":
      return { kind: "derefWord", pointer: lowerExprIR(expr.pointer, layout) };
    case "assignDerefByte":
      return { kind: "assignDerefByte", pointer: lowerExprIR(expr.pointer, layout), expr: lowerExprIR(expr.expr, layout) };
    case "assignDerefWord":
      return { kind: "assignDerefWord", pointer: lowerExprIR(expr.pointer, layout), expr: lowerExprIR(expr.expr, layout) };
    case "incDecDeref":
      return { kind: "incDecDeref", pointer: lowerExprIR(expr.pointer, layout), width: expr.width, op: expr.op, mode: expr.mode };
    case "incDecLocal":
      return { kind: "incDecLocal", offset: getLocalOffset(layout, expr.slot), width: expr.width, step: expr.step, op: expr.op, mode: expr.mode };
    case "incDecLocalArray":
      return { kind: "incDecLocalArray", offset: getLocalOffset(layout, expr.slot), index: lowerExprIR(expr.index, layout), op: expr.op, mode: expr.mode };
    case "incDecArgArray":
      return { kind: "incDecArgArray", offset: getParamOffset(layout, expr.slot), index: lowerExprIR(expr.index, layout), op: expr.op, mode: expr.mode };
    case "assignLocal":
      return { kind: "assignLocal", offset: getLocalOffset(layout, expr.slot), width: expr.width, expr: lowerExprIR(expr.expr, layout) };
    case "assignLocalArray":
      return { kind: "assignLocalArray", offset: getLocalOffset(layout, expr.slot), index: lowerExprIR(expr.index, layout), expr: lowerExprIR(expr.expr, layout) };
    case "assignArgArray":
      return { kind: "assignArgArray", offset: getParamOffset(layout, expr.slot), index: lowerExprIR(expr.index, layout), expr: lowerExprIR(expr.expr, layout) };
    case "comma":
      return { kind: "comma", left: lowerExprIR(expr.left, layout), right: lowerExprIR(expr.right, layout) };
    case "compare":
      return {
        kind: "compare",
        left: lowerExprIR(expr.left, layout),
        right: lowerExprIR(expr.right, layout),
        helper: expr.helper,
      };
    case "logical":
      return {
        kind: "logical",
        left: lowerExprIR(expr.left, layout),
        right: lowerExprIR(expr.right, layout),
        op: expr.op,
      };
    case "conditional":
      return {
        kind: "conditional",
        condition: lowerExprIR(expr.condition, layout),
        thenExpr: lowerExprIR(expr.thenExpr, layout),
        elseExpr: lowerExprIR(expr.elseExpr, layout),
      };
    case "bitwise":
      return {
        kind: "bitwise",
        left: lowerExprIR(expr.left, layout),
        right: lowerExprIR(expr.right, layout),
        op: expr.op,
      };
    case "helperBinary":
      return {
        kind: "helperBinary",
        left: lowerExprIR(expr.left, layout),
        right: lowerExprIR(expr.right, layout),
        helper: expr.helper,
      };
    case "divmod":
      return {
        kind: "divmod",
        left: lowerExprIR(expr.left, layout),
        right: lowerExprIR(expr.right, layout),
        result: expr.result,
      };
    case "additive":
      return {
        kind: "additive",
        left: lowerExprIR(expr.left, layout),
        right: lowerExprIR(expr.right, layout),
        op: expr.op,
      };
    case "aggregateValueFieldAccess":
      return {
        kind: "aggregateValueFieldAccess",
        source: lowerAggregateValueIR(expr.source, layout),
        tempOffset: getLocalOffset(layout, expr.tempSlot),
        offset: expr.offset,
        width: expr.width,
      };
    case "aggregateValueFieldAddress":
      return {
        kind: "aggregateValueFieldAddress",
        source: lowerAggregateValueIR(expr.source, layout),
        tempOffset: getLocalOffset(layout, expr.tempSlot),
        offset: expr.offset,
      };
    case "call":
      return {
        kind: "call",
        target: expr.target,
        args: expr.args?.map((arg) => lowerCallArgIR(arg, layout)),
      };
    case "ref":
      return lowerRefIR(expr, layout);
    default:
      return assertNever(expr);
  }
}

function lowerRefIR(ref: RefIR, layout: FunctionLayout): ExprSpec {
  const offset = ref.scope === "local" ? getLocalOffset(layout, ref.slot) : getParamOffset(layout, ref.slot);
  if (ref.scope === "local") {
    return ref.width === 1 ? { kind: "localChar", offset } : { kind: "localInt", offset };
  }
  return ref.width === 1 ? { kind: "argChar", offset } : { kind: "argInt", offset };
}

function lowerAggregateValueIR(expr: AggregateValueIR, layout: FunctionLayout): AggregateValueSpec {
  switch (expr.kind) {
    case "aggregateRef":
      return {
        kind: "aggregateRef",
        scope: expr.scope,
        offset: expr.scope === "local" ? getLocalOffset(layout, expr.slot) : getParamOffset(layout, expr.slot),
        size: expr.size,
      };
    case "aggregateAssignExpr":
      return {
        kind: "aggregateAssignExpr",
        targetOffset: getLocalOffset(layout, expr.targetSlot),
        source: lowerAggregateValueIR(expr.source, layout),
        size: expr.size,
      };
    case "call":
      return {
        kind: "call",
        target: expr.target,
        args: expr.args?.map((arg) => lowerCallArgIR(arg, layout)),
        size: expr.size,
      };
    case "comma":
      return {
        kind: "comma",
        left: lowerExprIR(expr.left, layout),
        right: lowerAggregateValueIR(expr.right, layout),
        size: expr.size,
      };
    case "conditional":
      return {
        kind: "conditional",
        condition: lowerExprIR(expr.condition, layout),
        thenExpr: lowerAggregateValueIR(expr.thenExpr, layout),
        elseExpr: lowerAggregateValueIR(expr.elseExpr, layout),
        size: expr.size,
      };
    default:
      return assertNever(expr);
  }
}

function lowerCallArgIR(arg: CallArgIR, layout: FunctionLayout): CallArgSpec {
  switch (arg.kind) {
    case "expr":
      return { kind: "expr", expr: lowerExprIR(arg.expr, layout) };
    case "aggregateAddress":
      return {
        kind: "aggregateAddress",
        source: lowerAggregateValueIR(arg.source, layout),
        tempOffset: getLocalOffset(layout, arg.tempSlot),
      };
    default:
      return assertNever(arg);
  }
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
  const ctx: EmitExprContext = {
    stackDelta: 0,
    labels: {
      nextLogicalLabelId: 2000,
      labelPrefix: fn.name,
    },
  };
  for (const statement of fn.statements) {
    lines.push(...emitStatement(statement, ctx));
  }
  return lines;
}

function emitStatement(statement: StatementSpec, ctx: EmitExprContext): string[] {
  switch (statement.kind) {
    case "materializeAggregateValue":
      return emitAggregateValueToLocal(statement.source, statement.targetOffset, ctx);
    case "call":
      return [`\tcall\t${statement.target}`];
    case "loadConstHl":
      return emitExprToHl({ kind: "const", value: statement.value }, ctx);
    case "loadDataAddressHl":
      return emitExprToHl({ kind: "dataAddress", label: statement.label }, ctx);
    case "loadExprHl":
      return emitExprToHl(statement.expr, ctx);
    case "pushExprArg":
      return emitPushArgs([{ kind: "expr", expr: statement.expr }], ctx);
    case "pushHlArg":
      return ["\tpush\thl"];
    case "popBc":
      return ["\tpop\tbc"];
    case "ret":
      return ["\tret"];
    case "callWithModeA":
      return [`\tld\ta,#${statement.mode}`, `\tcall\t${statement.target}`];
    case "truthJumpZero":
      return ["\tld\ta,h", "\tor\tl", `\tjp\tz,${statement.target}`];
    case "label":
      return [`${statement.name}:`];
    case "jump":
      return [`\tjp\t${statement.target}`];
    case "decSp":
      return emitReserveBytes(1);
    case "incSp":
      return emitReleaseBytes(1);
    case "reserveBytes":
      return emitReserveBytes(statement.count);
    case "releaseBytes":
      return emitReleaseBytes(statement.count);
    case "loadLocalAddrHl":
      return emitLoadStackAddrToHl(statement.offset, ctx);
    case "storeImmToLocal":
      return [...emitLoadStackAddrToHl(statement.offset, ctx), `\tld\t(hl),#${statement.value}`];
    case "storeExprToLocalByte":
      return emitStoreExprToLocalByte(statement.offset, statement.expr, ctx);
    case "storeExprToLocalArrayByte":
      return emitStoreExprToLocalArrayByte(statement.offset, statement.index, statement.expr, ctx);
    case "storeExprToArgArrayByte":
      return emitStoreExprToArgArrayByte(statement.offset, statement.index, statement.expr, ctx);
    case "loadLocalCharToHl":
      return emitExprToHl({ kind: "localChar", offset: statement.offset }, ctx);
    case "storeImm16ToLocal":
      return emitStoreImm16ToLocal(statement.offset, statement.value, ctx);
    case "storeExprToLocalWord":
      return emitStoreExprToLocalWord(statement.offset, statement.expr, ctx);
    case "loadLocalIntToHl":
      return emitExprToHl({ kind: "localInt", offset: statement.offset }, ctx);
    case "decLocalByte":
      return [...emitLoadStackAddrToHl(statement.offset, ctx), "\tdec\t(hl)"];
    case "compareExprHelper":
      return emitHelperCompare(statement.left, statement.right, statement.helper, ctx);
    default:
      return assertNever(statement);
  }
}

function emitExprToHl(expr: ExprSpec, ctx: EmitExprContext): string[] {
  switch (expr.kind) {
    case "const":
      return [`\tld\thl,#${expr.value}`];
    case "dataAddress":
      return [`\tld\thl,#${expr.label}+0`];
    case "localAddress":
      return emitLoadStackAddrToHl(expr.offset, ctx);
    case "localArrayElement":
      return emitLoadStackByteToHl(expr.offset, ctx);
    case "localArrayElementExpr":
      return emitLoadIndexedLocalByteToHl(expr.offset, expr.index, ctx);
    case "argArrayElement":
      return emitLoadIndexedArgByteToHl(expr.offset, expr.index, ctx);
    case "pointerAdd":
      return emitPointerAddExpr(expr.pointer, expr.index, expr.scale, ctx);
    case "derefByte":
      return emitDerefByteExpr(expr.pointer, ctx);
    case "derefWord":
      return emitDerefWordExpr(expr.pointer, ctx);
    case "assignDerefByte":
      return emitAssignDerefByteExpr(expr.pointer, expr.expr, ctx);
    case "assignDerefWord":
      return emitAssignDerefWordExpr(expr.pointer, expr.expr, ctx);
    case "incDecDeref":
      return expr.width === 1
        ? emitIncDecDerefByteExpr(expr.pointer, expr.op, expr.mode, ctx)
        : emitIncDecDerefWordExpr(expr.pointer, expr.op, expr.mode, ctx);
    case "incDecLocal":
      return expr.width === 1
        ? emitIncDecLocalByteExpr(expr.offset, expr.op, expr.mode, ctx)
        : emitIncDecLocalWordExpr(expr.offset, expr.step, expr.op, expr.mode, ctx);
    case "incDecLocalArray":
      return emitIncDecLocalArrayExpr(expr.offset, expr.index, expr.op, expr.mode, ctx);
    case "incDecArgArray":
      return emitIncDecArgArrayExpr(expr.offset, expr.index, expr.op, expr.mode, ctx);
    case "assignLocal":
      return expr.width === 1
        ? emitAssignLocalByteExpr(expr.offset, expr.expr, ctx)
        : emitAssignLocalWordExpr(expr.offset, expr.expr, ctx);
    case "assignLocalArray":
      return emitAssignLocalArrayExpr(expr.offset, expr.index, expr.expr, ctx);
    case "assignArgArray":
      return emitAssignArgArrayExpr(expr.offset, expr.index, expr.expr, ctx);
    case "comma":
      return [...emitExprToHl(expr.left, ctx), ...emitExprToHl(expr.right, ctx)];
    case "call":
      return emitCallExpr(expr.target, expr.args ?? [], ctx);
    case "conditional":
      return emitConditionalExpr(expr.condition, expr.thenExpr, expr.elseExpr, ctx);
    case "logical":
      return emitLogicalExpr(expr.left, expr.right, expr.op, ctx);
    case "bitwise":
      return emitBitwiseExpr(expr.left, expr.right, expr.op, ctx);
    case "helperBinary":
      return emitHelperBinaryExpr(expr.left, expr.right, expr.helper, ctx);
    case "divmod":
      return emitDivmodExpr(expr.left, expr.right, expr.result, ctx);
    case "compare":
      return emitHelperCompare(expr.left, expr.right, expr.helper, ctx);
    case "additive":
      return emitAdditiveExpr(expr.left, expr.right, expr.op, ctx);
    case "aggregateValueFieldAccess":
      return emitAggregateValueFieldAccessExpr(expr.source, expr.tempOffset, expr.offset, expr.width, ctx);
    case "aggregateValueFieldAddress":
      return emitAggregateValueFieldAddressExpr(expr.source, expr.tempOffset, expr.offset, ctx);
    case "localChar":
    case "argChar":
      return emitLoadStackByteToHl(expr.offset, ctx);
    case "localInt":
    case "argInt":
      return emitLoadStackWordToHl(expr.offset, ctx);
    default:
      return assertNever(expr);
  }
}

function emitCallExpr(target: string, args: CallArgSpec[], ctx: EmitExprContext): string[] {
  if (args.length === 0) {
    return [`\tcall\t${target}`];
  }
  return [...emitPushArgs(args, ctx), `\tcall\t${target}`, ...Array.from({ length: args.length }, () => "\tpop\tbc")];
}

function emitPushArgs(args: CallArgSpec[], ctx: EmitExprContext): string[] {
  const lines: string[] = [];
  let stackDelta = ctx.stackDelta;
  for (const arg of args) {
    if (arg.kind === "expr") {
      lines.push(...emitExprToHl(arg.expr, { ...ctx, stackDelta }));
    } else {
      lines.push(...emitAggregateValueToLocal(arg.source, arg.tempOffset, { ...ctx, stackDelta }));
      lines.push(...emitExprToHl({ kind: "localAddress", offset: arg.tempOffset }, { ...ctx, stackDelta }));
    }
    lines.push("\tpush\thl");
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

function emitLoadStackAddrToHl(offset: number, ctx: EmitExprContext): string[] {
  return [`\tld\thl,#${offset + ctx.stackDelta}`, "\tadd\thl,sp"];
}

function emitLoadStackByteToHl(offset: number, ctx: EmitExprContext): string[] {
  return [...emitLoadStackAddrToHl(offset, ctx), "\tld\tl,(hl)", "\tld\th,#0"];
}

function emitLoadStackWordToHl(offset: number, ctx: EmitExprContext): string[] {
  return [...emitLoadStackAddrToHl(offset, ctx), "\tld\ta,(hl)", "\tinc\thl", "\tld\th,(hl)", "\tld\tl,a"];
}

function emitStoreExprToLocalByte(offset: number, expr: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(expr, ctx),
    "\tpush\thl",
    ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tld\t(hl),e",
  ];
}

function emitStoreExprToLocalArrayByte(offset: number, index: ExprSpec, expr: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(expr, ctx),
    "\tpush\thl",
    ...emitExprToHl(index, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpush\thl",
    ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 4 }),
    "\tpop\tde",
    "\tadd\thl,de",
    "\tpop\tde",
    "\tld\t(hl),e",
  ];
}

function emitStoreExprToArgArrayByte(offset: number, index: ExprSpec, expr: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(expr, ctx),
    "\tpush\thl",
    ...emitExprToHl(index, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpush\thl",
    ...emitLoadStackWordToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 4 }),
    "\tpop\tde",
    "\tadd\thl,de",
    "\tpop\tde",
    "\tld\t(hl),e",
  ];
}

function emitStoreImm16ToLocal(offset: number, value: number, ctx: EmitExprContext): string[] {
  return [
    ...emitLoadStackAddrToHl(offset, ctx),
    `\tld\t(hl),#${value & 0xff}`,
    "\tinc\thl",
    `\tld\t(hl),#${(value >> 8) & 0xff}`,
  ];
}

function emitStoreExprToLocalWord(offset: number, expr: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(expr, ctx),
    "\tpush\thl",
    ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tld\t(hl),e",
    "\tinc\thl",
    "\tld\t(hl),d",
  ];
}

function emitAssignLocalByteExpr(offset: number, expr: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(expr, ctx),
    "\tpush\thl",
    ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tld\t(hl),e",
    "\tld\tl,e",
    "\tld\th,#0",
  ];
}

function emitAssignLocalWordExpr(offset: number, expr: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(expr, ctx),
    "\tpush\thl",
    ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tld\t(hl),e",
    "\tinc\thl",
    "\tld\t(hl),d",
    "\tex\tde,hl",
  ];
}

function emitAssignLocalArrayExpr(offset: number, index: ExprSpec, expr: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(expr, ctx),
    "\tpush\thl",
    ...emitExprToHl(index, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpush\thl",
    ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 4 }),
    "\tpop\tde",
    "\tadd\thl,de",
    "\tpop\tde",
    "\tld\t(hl),e",
    "\tld\tl,e",
    "\tld\th,#0",
  ];
}

function emitAssignArgArrayExpr(offset: number, index: ExprSpec, expr: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(expr, ctx),
    "\tpush\thl",
    ...emitExprToHl(index, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpush\thl",
    ...emitLoadStackWordToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 4 }),
    "\tpop\tde",
    "\tadd\thl,de",
    "\tpop\tde",
    "\tld\t(hl),e",
    "\tld\tl,e",
    "\tld\th,#0",
  ];
}

function emitPointerAddExpr(pointer: ExprSpec, index: ExprSpec, scale: 1 | 2, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(pointer, ctx),
    "\tpush\thl",
    ...emitExprToHl(index, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    ...(scale === 2 ? ["\tadd\thl,hl"] : []),
    "\tpop\tde",
    "\tadd\thl,de",
  ];
}

function emitDerefByteExpr(pointer: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(pointer, ctx),
    "\tld\tl,(hl)",
    "\tld\th,#0",
  ];
}

function emitDerefWordExpr(pointer: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(pointer, ctx),
    "\tld\ta,(hl)",
    "\tinc\thl",
    "\tld\th,(hl)",
    "\tld\tl,a",
  ];
}

function emitAssignDerefByteExpr(pointer: ExprSpec, expr: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(expr, ctx),
    "\tpush\thl",
    ...emitExprToHl(pointer, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tld\t(hl),e",
    "\tld\tl,e",
    "\tld\th,#0",
  ];
}

function emitAssignDerefWordExpr(pointer: ExprSpec, expr: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(expr, ctx),
    "\tpush\thl",
    ...emitExprToHl(pointer, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tld\t(hl),e",
    "\tinc\thl",
    "\tld\t(hl),d",
    "\tex\tde,hl",
  ];
}

function emitIncDecDerefByteExpr(pointer: ExprSpec, op: "++" | "--", mode: "prefix" | "postfix", ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(pointer, ctx),
    "\tld\te,(hl)",
    ...(mode === "postfix" ? ["\tld\td,#0", "\tpush\tde"] : []),
    op === "++" ? "\tinc\te" : "\tdec\te",
    "\tld\t(hl),e",
    ...(mode === "prefix" ? ["\tld\tl,e", "\tld\th,#0"] : ["\tpop\thl"]),
  ];
}

function emitIncDecDerefWordExpr(pointer: ExprSpec, op: "++" | "--", mode: "prefix" | "postfix", ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(pointer, ctx),
    "\tld\te,(hl)",
    "\tinc\thl",
    "\tld\td,(hl)",
    ...(mode === "postfix" ? ["\tpush\tde"] : []),
    ...(op === "++" ? ["\tinc\tde"] : ["\tdec\tde"]),
    "\tdec\thl",
    "\tld\t(hl),e",
    "\tinc\thl",
    "\tld\t(hl),d",
    ...(mode === "prefix" ? ["\tex\tde,hl"] : ["\tpop\thl"]),
  ];
}

function emitIncDecLocalByteExpr(offset: number, op: "++" | "--", mode: "prefix" | "postfix", ctx: EmitExprContext): string[] {
  return [
    ...emitLoadStackAddrToHl(offset, ctx),
    "\tld\te,(hl)",
    ...(mode === "postfix" ? ["\tld\tl,e", "\tld\th,#0"] : []),
    op === "++" ? "\tinc\te" : "\tdec\te",
    "\tld\t(hl),e",
    ...(mode === "prefix" ? ["\tld\tl,e", "\tld\th,#0"] : []),
  ];
}

function emitIncDecLocalWordExpr(offset: number, step: 1 | 2, op: "++" | "--", mode: "prefix" | "postfix", ctx: EmitExprContext): string[] {
  return [
    ...emitLoadStackAddrToHl(offset, ctx),
    "\tld\te,(hl)",
    "\tinc\thl",
    "\tld\td,(hl)",
    ...(mode === "postfix" ? ["\tpush\tde"] : []),
    ...(op === "++"
      ? step === 2 ? ["\tinc\tde", "\tinc\tde"] : ["\tinc\tde"]
      : step === 2 ? ["\tdec\tde", "\tdec\tde"] : ["\tdec\tde"]),
    "\tld\t(hl),d",
    "\tdec\thl",
    "\tld\t(hl),e",
    ...(mode === "prefix" ? ["\tex\tde,hl"] : ["\tpop\thl"]),
  ];
}

function emitIncDecLocalArrayExpr(offset: number, index: ExprSpec, op: "++" | "--", mode: "prefix" | "postfix", ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(index, ctx),
    "\tpush\thl",
    ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tadd\thl,de",
    "\tld\te,(hl)",
    ...(mode === "postfix" ? ["\tld\tl,e", "\tld\th,#0"] : []),
    op === "++" ? "\tinc\te" : "\tdec\te",
    "\tld\t(hl),e",
    ...(mode === "prefix" ? ["\tld\tl,e", "\tld\th,#0"] : []),
  ];
}

function emitIncDecArgArrayExpr(offset: number, index: ExprSpec, op: "++" | "--", mode: "prefix" | "postfix", ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(index, ctx),
    "\tpush\thl",
    ...emitLoadStackWordToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tadd\thl,de",
    "\tld\te,(hl)",
    ...(mode === "postfix" ? ["\tld\tl,e", "\tld\th,#0"] : []),
    op === "++" ? "\tinc\te" : "\tdec\te",
    "\tld\t(hl),e",
    ...(mode === "prefix" ? ["\tld\tl,e", "\tld\th,#0"] : []),
  ];
}

function emitLoadIndexedLocalByteToHl(offset: number, index: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(index, ctx),
    "\tpush\thl",
    ...emitLoadStackAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tadd\thl,de",
    "\tld\tl,(hl)",
    "\tld\th,#0",
  ];
}

function emitLoadIndexedArgByteToHl(offset: number, index: ExprSpec, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(index, ctx),
    "\tpush\thl",
    ...emitLoadStackWordToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tadd\thl,de",
    "\tld\tl,(hl)",
    "\tld\th,#0",
  ];
}

function emitHelperCompare(left: ExprSpec, right: ExprSpec, helper: string, ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(left, ctx),
    "\tpush\thl",
    ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    `\tcall\t${helper}`,
  ];
}

function emitAdditiveExpr(left: ExprSpec, right: ExprSpec, op: "+" | "-", ctx: EmitExprContext): string[] {
  const lines = [
    ...emitExprToHl(left, ctx),
    "\tpush\thl",
    ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
  ];
  if (op === "+") {
    return [...lines, "\tadd\thl,de"];
  }
  return [...lines, "\tex\tde,hl", "\tor\ta", "\tsbc\thl,de"];
}

function emitAggregateValueFieldAccessExpr(
  source: AggregateValueSpec,
  tempOffset: number,
  fieldOffset: number,
  width: ValueWidth,
  ctx: EmitExprContext,
): string[] {
  const loadExpr: ExprSpec = width === 1
    ? { kind: "localChar", offset: tempOffset + fieldOffset }
    : { kind: "localInt", offset: tempOffset + fieldOffset };
  return [
    ...emitAggregateValueToLocal(source, tempOffset, ctx),
    ...emitExprToHl(loadExpr, ctx),
  ];
}

function emitAggregateValueFieldAddressExpr(
  source: AggregateValueSpec,
  tempOffset: number,
  fieldOffset: number,
  ctx: EmitExprContext,
): string[] {
  return [
    ...emitAggregateValueToLocal(source, tempOffset, ctx),
    ...emitLoadStackAddrToHl(tempOffset + fieldOffset, ctx),
  ];
}

function emitAggregateValueToLocal(source: AggregateValueSpec, targetOffset: number, ctx: EmitExprContext): string[] {
  switch (source.kind) {
    case "aggregateRef":
      return source.scope === "local"
        ? emitAggregateCopyFromLocal(source.offset, targetOffset, source.size, ctx)
        : emitAggregateCopyFromArgAddress(source.offset, targetOffset, source.size, ctx);
    case "aggregateAssignExpr":
      return [
        ...emitAggregateValueToLocal(source.source, source.targetOffset, ctx),
        ...(source.targetOffset === targetOffset ? [] : emitAggregateCopyFromLocal(source.targetOffset, targetOffset, source.size, ctx)),
      ];
    case "call":
      return [
        ...emitPushArgs([{ kind: "expr", expr: { kind: "localAddress", offset: targetOffset } }, ...(source.args ?? [])], ctx),
        `\tcall\t${source.target}`,
        ...Array.from({ length: (source.args?.length ?? 0) + 1 }, () => "\tpop\tbc"),
      ];
    case "comma":
      return [
        ...emitExprToHl(source.left, ctx),
        ...emitAggregateValueToLocal(source.right, targetOffset, ctx),
      ];
    case "conditional": {
      const elseLabel = allocateExprLabel(ctx);
      const endLabel = allocateExprLabel(ctx);
      return [
        ...emitExprToHl(source.condition, ctx),
        "\tld\ta,h",
        "\tor\tl",
        `\tjp\tz,${elseLabel}`,
        ...emitAggregateValueToLocal(source.thenExpr, targetOffset, ctx),
        `\tjp\t${endLabel}`,
        `${elseLabel}:`,
        ...emitAggregateValueToLocal(source.elseExpr, targetOffset, ctx),
        `${endLabel}:`,
      ];
    }
    default:
      return assertNever(source);
  }
}

function emitAggregateCopyFromLocal(sourceOffset: number, targetOffset: number, size: number, ctx: EmitExprContext): string[] {
  const lines: string[] = [];
  for (let index = 0; index < size; index += 1) {
    lines.push(
      ...emitAssignDerefByteExpr(
        {
          kind: "pointerAdd",
          pointer: { kind: "localAddress", offset: targetOffset },
          index: { kind: "const", value: index },
          scale: 1,
        },
        {
          kind: "derefByte",
          pointer: {
            kind: "pointerAdd",
            pointer: { kind: "localAddress", offset: sourceOffset },
            index: { kind: "const", value: index },
            scale: 1,
          },
        },
        ctx,
      ),
    );
  }
  return lines;
}

function emitAggregateCopyFromArgAddress(sourceOffset: number, targetOffset: number, size: number, ctx: EmitExprContext): string[] {
  const lines: string[] = [];
  for (let index = 0; index < size; index += 1) {
    lines.push(
      ...emitAssignDerefByteExpr(
        {
          kind: "pointerAdd",
          pointer: { kind: "localAddress", offset: targetOffset },
          index: { kind: "const", value: index },
          scale: 1,
        },
        {
          kind: "derefByte",
          pointer: {
            kind: "pointerAdd",
            pointer: { kind: "argInt", offset: sourceOffset },
            index: { kind: "const", value: index },
            scale: 1,
          },
        },
        ctx,
      ),
    );
  }
  return lines;
}

function emitLogicalExpr(left: ExprSpec, right: ExprSpec, op: "&&" | "||", ctx: EmitExprContext): string[] {
  const trueLabel = allocateExprLabel(ctx);
  const falseLabel = allocateExprLabel(ctx);
  const endLabel = allocateExprLabel(ctx);
  if (op === "&&") {
    return [
      ...emitExprToHl(left, ctx),
      "\tld\ta,h",
      "\tor\tl",
      `\tjp\tz,${falseLabel}`,
      ...emitExprToHl(right, ctx),
      "\tld\ta,h",
      "\tor\tl",
      `\tjp\tz,${falseLabel}`,
      `${trueLabel}:`,
      "\tld\thl,#1",
      `\tjp\t${endLabel}`,
      `${falseLabel}:`,
      "\tld\thl,#0",
      `${endLabel}:`,
    ];
  }
  return [
    ...emitExprToHl(left, ctx),
    "\tld\ta,h",
    "\tor\tl",
    `\tjp\tnz,${trueLabel}`,
    ...emitExprToHl(right, ctx),
    "\tld\ta,h",
    "\tor\tl",
    `\tjp\tnz,${trueLabel}`,
    `${falseLabel}:`,
    "\tld\thl,#0",
    `\tjp\t${endLabel}`,
    `${trueLabel}:`,
    "\tld\thl,#1",
    `${endLabel}:`,
  ];
}

function emitConditionalExpr(condition: ExprSpec, thenExpr: ExprSpec, elseExpr: ExprSpec, ctx: EmitExprContext): string[] {
  const elseLabel = allocateExprLabel(ctx);
  const endLabel = allocateExprLabel(ctx);
  return [
    ...emitExprToHl(condition, ctx),
    "\tld\ta,h",
    "\tor\tl",
    `\tjp\tz,${elseLabel}`,
    ...emitExprToHl(thenExpr, ctx),
    `\tjp\t${endLabel}`,
    `${elseLabel}:`,
    ...emitExprToHl(elseExpr, ctx),
    `${endLabel}:`,
  ];
}

function emitBitwiseExpr(left: ExprSpec, right: ExprSpec, op: "&" | "^" | "|", ctx: EmitExprContext): string[] {
  const lines = [
    ...emitExprToHl(left, ctx),
    "\tpush\thl",
    ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
  ];
  switch (op) {
    case "&":
      return [...lines, "\tld\ta,h", "\tand\td", "\tld\th,a", "\tld\ta,l", "\tand\te", "\tld\tl,a"];
    case "^":
      return [...lines, "\tld\ta,h", "\txor\td", "\tld\th,a", "\tld\ta,l", "\txor\te", "\tld\tl,a"];
    case "|":
      return [...lines, "\tld\ta,h", "\tor\td", "\tld\th,a", "\tld\ta,l", "\tor\te", "\tld\tl,a"];
    default:
      return assertNever(op);
  }
}

function emitHelperBinaryExpr(left: ExprSpec, right: ExprSpec, helper: ".mul" | ".asl" | ".asr", ctx: EmitExprContext): string[] {
  return [
    ...emitExprToHl(left, ctx),
    "\tpush\thl",
    ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    `\tcall\t${helper}`,
  ];
}

function emitDivmodExpr(left: ExprSpec, right: ExprSpec, result: "quotient" | "remainder", ctx: EmitExprContext): string[] {
  const lines = [
    ...emitExprToHl(left, ctx),
    "\tpush\thl",
    ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
    "\tpop\tde",
    "\tcall\t.div",
  ];
  if (result === "quotient") {
    return lines;
  }
  return [...lines, "\tex\tde,hl"];
}

function allocateExprLabel(ctx: EmitExprContext): string {
  const label = `.${ctx.labels.labelPrefix}_${ctx.labels.nextLogicalLabelId}`;
  ctx.labels.nextLogicalLabelId += 1;
  return label;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled statement kind: ${JSON.stringify(value)}`);
}

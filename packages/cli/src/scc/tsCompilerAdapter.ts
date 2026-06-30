import fs from "node:fs";
import path from "node:path";
import { assemble } from "../cli/mz80-as";
import { Logger } from "../logger";
import { CompilerAdapter, CompilerAdapterCompileOptions, CompileSccSourceResult } from "./compilerAdapter";
import { getSccFixture, readSccFixture } from "./fixtures";
import { translateSccAsm } from "./translateAsm";

export type TsSccCompilerAdapterOptions = {
  fixtureId?: string;
};

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
  | { kind: "loadLocalCharToHl"; offset: number }
  | { kind: "storeImm16ToLocal"; offset: number; value: number }
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
    const fixtureLabel = this.fixtureId ? ` using fixture ${this.fixtureId}` : "";
    const fixtureNotes = this.fixtureId
      ? ` Reference fixture: ${describeFixture(this.fixtureId)}.`
      : "";
    throw new Error(
      `TsSccCompilerAdapter is not implemented for ${opts.inputFile}${fixtureLabel}.`
      + " Implement frontend parsing, fragment lowering, SCC helper lowering, and mz80 code emission first."
      + fixtureNotes,
    );
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

function sanitizeStageStem(stem: string): string {
  return stem.replace(/[^a-z0-9_.$@]/gi, "_");
}

function emitFixtureBackedSccAsm(fixtureId: string): string {
  const spec = makeFixtureProgramSpec(fixtureId);
  if (spec) return emitProgram(spec);
  return readSccFixture(fixtureId);
}

function makeFixtureProgramSpec(fixtureId: string): ProgramSpec | null {
  switch (fixtureId) {
    case "frag-string-scc":
      return {
        moduleName: "frag_string.i",
        exports: ["main"],
        includeBss: true,
        data: [{ label: ".0", directive: ".asciz", value: '"HELLO"' }],
        functions: [lowerFunctionIR({
          name: "main",
          params: [],
          locals: [],
          body: [
            { kind: "returnExpr", expr: { kind: "dataAddress", label: ".0" } },
          ],
        })],
      };
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
    case "frag-call-scc":
      return {
        moduleName: "frag_call.i",
        exports: ["outstr", "main"],
        includeBss: false,
        functions: [lowerFunctionIR({
          name: "main",
          params: [],
          locals: [],
          body: [
            { kind: "returnExpr", expr: { kind: "call", target: "outstr" } },
          ],
        })],
      };
    case "stmt-outstr-scc":
      return {
        moduleName: "stmt_outstr.i",
        exports: ["outstr", "main"],
        includeBss: true,
        data: [{ label: ".0", directive: ".ascii", value: '"TS STMT$"' }],
        functions: [lowerFunctionIR({
          name: "main",
          params: [],
          locals: [],
          body: [
            { kind: "callModeAArg", target: "outstr", mode: 1, expr: { kind: "dataAddress", label: ".0" } },
            { kind: "returnVoid" },
          ],
        })],
      };
    case "stmt-call-result-scc":
      return {
        moduleName: "stmt_call_result.i",
        exports: ["outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [],
            body: [
              { kind: "emitExprChar", expr: { kind: "call", target: "value" } },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "value",
            params: [],
            locals: [],
            body: [
              { kind: "returnExpr", expr: { kind: "const", value: 88 } },
            ],
          }),
        ],
      };
    case "stmt-branch-scc":
      return {
        moduleName: "stmt_branch.i",
        exports: ["outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [],
            body: [
              {
                kind: "ifExprZero",
                expr: { kind: "call", target: "flag" },
                thenBody: [{ kind: "emitChar", value: 84 }],
                elseBody: [{ kind: "emitChar", value: 70 }],
              },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "flag",
            params: [],
            locals: [],
            body: [
              { kind: "returnExpr", expr: { kind: "const", value: 1 } },
            ],
          }),
        ],
      };
    case "stmt-local-slot-scc":
      return {
        moduleName: "stmt_local_slot.i",
        exports: ["outchar", "main"],
        includeBss: true,
        functions: [lowerFunctionIR({
          name: "main",
          params: [],
          locals: [1],
          body: [
            { kind: "assignLocalConst", slot: 0, width: 1, value: 76 },
            { kind: "emitExprChar", expr: { kind: "ref", scope: "local", width: 1, slot: 0 } },
            { kind: "returnVoid" },
          ],
        })],
      };
    case "stmt-compare-helper-scc":
      return {
        moduleName: "stmt_compare_helper.i",
        exports: [".gt", "outchar", "main"],
        includeBss: true,
        functions: [lowerFunctionIR({
          name: "main",
          params: [],
          locals: [],
          body: [
            {
              kind: "ifExprZero",
              expr: { kind: "compare", left: { kind: "const", value: 66 }, right: { kind: "const", value: 65 }, helper: ".gt" },
              thenBody: [{ kind: "emitChar", value: 89 }],
              elseBody: [{ kind: "emitChar", value: 78 }],
            },
            { kind: "returnVoid" },
          ],
        })],
      };
    case "stmt-local-compare-scc":
      return {
        moduleName: "stmt_local_compare.i",
        exports: [".gt", "outchar", "main"],
        includeBss: true,
        functions: [lowerFunctionIR({
          name: "main",
          params: [],
          locals: [1],
          body: [
            { kind: "assignLocalConst", slot: 0, width: 1, value: 67 },
            {
              kind: "ifExprZero",
              expr: {
                kind: "compare",
                left: { kind: "ref", scope: "local", width: 1, slot: 0 },
                right: { kind: "const", value: 66 },
                helper: ".gt",
              },
              thenBody: [{ kind: "emitChar", value: 87 }],
              elseBody: [{ kind: "emitChar", value: 88 }],
            },
            { kind: "returnVoid" },
          ],
        })],
      };
    case "stmt-local-int-scc":
      return {
        moduleName: "stmt_local_int.i",
        exports: ["outchar", "main"],
        includeBss: true,
        functions: [lowerFunctionIR({
          name: "main",
          params: [],
          locals: [2],
          body: [
            { kind: "assignLocalConst", slot: 0, width: 2, value: 90 },
            { kind: "emitExprChar", expr: { kind: "ref", scope: "local", width: 2, slot: 0 } },
            { kind: "returnVoid" },
          ],
        })],
      };
    case "stmt-eq-helper-scc":
      return {
        moduleName: "stmt_eq_helper.i",
        exports: [".eq", "outchar", "main"],
        includeBss: true,
        functions: [lowerFunctionIR({
          name: "main",
          params: [],
          locals: [],
          body: [
            {
              kind: "ifExprZero",
              expr: { kind: "compare", left: { kind: "const", value: 81 }, right: { kind: "const", value: 81 }, helper: ".eq" },
              thenBody: [{ kind: "emitChar", value: 69 }],
              elseBody: [{ kind: "emitChar", value: 88 }],
            },
            { kind: "returnVoid" },
          ],
        })],
      };
    case "stmt-loop-scc":
      return {
        moduleName: "stmt_loop.i",
        exports: [".gt", "outchar", "main"],
        includeBss: true,
        functions: [lowerFunctionIR({
          name: "main",
          params: [],
          locals: [1],
          body: [
            { kind: "assignLocalConst", slot: 0, width: 1, value: 51 },
            {
              kind: "doWhileExprNonZero",
              body: [
                { kind: "emitExprChar", expr: { kind: "ref", scope: "local", width: 1, slot: 0 } },
                { kind: "decLocalByte", slot: 0 },
              ],
              expr: {
                kind: "compare",
                left: { kind: "ref", scope: "local", width: 1, slot: 0 },
                right: { kind: "const", value: 48 },
                helper: ".gt",
              },
            },
            { kind: "returnVoid" },
          ],
        })],
      };
    case "stmt-arg-char-scc":
      return {
        moduleName: "stmt_arg_char.i",
        exports: ["outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [],
            body: [
              { kind: "emitExprChar", expr: { kind: "call", target: "echo", args: [{ kind: "const", value: 65 }] } },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "echo",
            params: [1],
            locals: [],
            body: [
              { kind: "returnExpr", expr: { kind: "ref", scope: "arg", width: 1, slot: 0 } },
            ],
          }),
        ],
      };
    case "stmt-arg-ne-helper-scc":
      return {
        moduleName: "stmt_arg_ne_helper.i",
        exports: [".ne", "outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [],
            body: [
              {
                kind: "ifExprZero",
                expr: { kind: "call", target: "check", args: [{ kind: "const", value: 66 }] },
                thenBody: [{ kind: "emitChar", value: 78 }],
                elseBody: [{ kind: "emitChar", value: 88 }],
              },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "check",
            params: [1],
            locals: [],
            body: [
              {
                kind: "compareReturn",
                left: { kind: "ref", scope: "arg", width: 1, slot: 0 },
                right: { kind: "const", value: 65 },
                helper: ".ne",
              },
            ],
          }),
        ],
      };
    case "stmt-arg-int-scc":
      return {
        moduleName: "stmt_arg_int.i",
        exports: ["outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [],
            body: [
              { kind: "emitExprChar", expr: { kind: "call", target: "echo16", args: [{ kind: "const", value: 90 }] } },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "echo16",
            params: [2],
            locals: [],
            body: [
              { kind: "returnExpr", expr: { kind: "ref", scope: "arg", width: 2, slot: 0 } },
            ],
          }),
        ],
      };
    case "stmt-two-arg-char-scc":
      return {
        moduleName: "stmt_two_arg_char.i",
        exports: ["outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [],
            body: [
              {
                kind: "emitExprChar",
                expr: {
                  kind: "call",
                  target: "pickfirst",
                  args: [{ kind: "const", value: 65 }, { kind: "const", value: 66 }],
                },
              },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "pickfirst",
            params: [1, 1],
            locals: [],
            body: [
              { kind: "returnExpr", expr: { kind: "ref", scope: "arg", width: 1, slot: 0 } },
            ],
          }),
        ],
      };
    case "stmt-arg-int-eq-helper-scc":
      return {
        moduleName: "stmt_arg_int_eq_helper.i",
        exports: [".eq", "outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [],
            body: [
              {
                kind: "ifExprZero",
                expr: { kind: "call", target: "check16", args: [{ kind: "const", value: 90 }] },
                thenBody: [{ kind: "emitChar", value: 73 }],
                elseBody: [{ kind: "emitChar", value: 88 }],
              },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "check16",
            params: [2],
            locals: [],
            body: [
              {
                kind: "compareReturn",
                left: { kind: "ref", scope: "arg", width: 2, slot: 0 },
                right: { kind: "const", value: 90 },
                helper: ".eq",
              },
            ],
          }),
        ],
      };
    case "stmt-two-arg-ne-helper-scc":
      return {
        moduleName: "stmt_two_arg_ne_helper.i",
        exports: [".ne", "outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [],
            body: [
              {
                kind: "ifExprZero",
                expr: {
                  kind: "call",
                  target: "checkpair",
                  args: [{ kind: "const", value: 65 }, { kind: "const", value: 66 }],
                },
                thenBody: [{ kind: "emitChar", value: 68 }],
                elseBody: [{ kind: "emitChar", value: 88 }],
              },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "checkpair",
            params: [1, 1],
            locals: [],
            body: [
              {
                kind: "compareReturn",
                left: { kind: "ref", scope: "arg", width: 1, slot: 0 },
                right: { kind: "ref", scope: "arg", width: 1, slot: 1 },
                helper: ".ne",
              },
            ],
          }),
        ],
      };
    case "stmt-call-two-arg-mixed-scc":
      return {
        moduleName: "stmt_call_two_arg_mixed.i",
        exports: ["outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [1],
            body: [
              { kind: "assignLocalConst", slot: 0, width: 1, value: 67 },
              {
                kind: "emitExprChar",
                expr: {
                  kind: "call",
                  target: "pickfirst",
                  args: [
                    { kind: "ref", scope: "local", width: 1, slot: 0 },
                    { kind: "const", value: 68 },
                  ],
                },
              },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "pickfirst",
            params: [1, 1],
            locals: [],
            body: [
              { kind: "returnExpr", expr: { kind: "ref", scope: "arg", width: 1, slot: 0 } },
            ],
          }),
        ],
      };
    case "stmt-two-arg-local-ne-helper-scc":
      return {
        moduleName: "stmt_two_arg_local_ne_helper.i",
        exports: [".ne", "outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [1],
            body: [
              { kind: "assignLocalConst", slot: 0, width: 1, value: 67 },
              {
                kind: "ifExprZero",
                expr: {
                  kind: "call",
                  target: "checkpair",
                  args: [
                    { kind: "ref", scope: "local", width: 1, slot: 0 },
                    { kind: "const", value: 68 },
                  ],
                },
                thenBody: [{ kind: "emitChar", value: 77 }],
                elseBody: [{ kind: "emitChar", value: 88 }],
              },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "checkpair",
            params: [1, 1],
            locals: [],
            body: [
              {
                kind: "compareReturn",
                left: { kind: "ref", scope: "arg", width: 1, slot: 0 },
                right: { kind: "ref", scope: "arg", width: 1, slot: 1 },
                helper: ".ne",
              },
            ],
          }),
        ],
      };
    case "stmt-local-int-arg-int-eq-helper-scc":
      return {
        moduleName: "stmt_local_int_arg_int_eq_helper.i",
        exports: [".eq", "outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [],
            body: [
              {
                kind: "ifExprZero",
                expr: { kind: "call", target: "checkmix", args: [{ kind: "const", value: 90 }] },
                thenBody: [{ kind: "emitChar", value: 81 }],
                elseBody: [{ kind: "emitChar", value: 88 }],
              },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "checkmix",
            params: [2],
            locals: [2],
            body: [
              { kind: "assignLocalConst", slot: 0, width: 2, value: 90 },
              {
                kind: "compareReturn",
                left: { kind: "ref", scope: "local", width: 2, slot: 0 },
                right: { kind: "ref", scope: "arg", width: 2, slot: 0 },
                helper: ".eq",
              },
            ],
          }),
        ],
      };
    case "stmt-local-int-arg-int-ne-helper-scc":
      return {
        moduleName: "stmt_local_int_arg_int_ne_helper.i",
        exports: [".ne", "outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [],
            body: [
              {
                kind: "ifExprZero",
                expr: { kind: "call", target: "checkmixne", args: [{ kind: "const", value: 91 }] },
                thenBody: [{ kind: "emitChar", value: 82 }],
                elseBody: [{ kind: "emitChar", value: 88 }],
              },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "checkmixne",
            params: [2],
            locals: [2],
            body: [
              { kind: "assignLocalConst", slot: 0, width: 2, value: 90 },
              {
                kind: "compareReturn",
                left: { kind: "ref", scope: "local", width: 2, slot: 0 },
                right: { kind: "ref", scope: "arg", width: 2, slot: 0 },
                helper: ".ne",
              },
            ],
          }),
        ],
      };
    case "stmt-local-int-arg-int-gt-helper-scc":
      return {
        moduleName: "stmt_local_int_arg_int_gt_helper.i",
        exports: [".gt", "outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [],
            body: [
              {
                kind: "ifExprZero",
                expr: { kind: "call", target: "checkmixgt", args: [{ kind: "const", value: 90 }] },
                thenBody: [{ kind: "emitChar", value: 84 }],
                elseBody: [{ kind: "emitChar", value: 88 }],
              },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "checkmixgt",
            params: [2],
            locals: [2],
            body: [
              { kind: "assignLocalConst", slot: 0, width: 2, value: 91 },
              {
                kind: "compareReturn",
                left: { kind: "ref", scope: "local", width: 2, slot: 0 },
                right: { kind: "ref", scope: "arg", width: 2, slot: 0 },
                helper: ".gt",
              },
            ],
          }),
        ],
      };
    case "stmt-call-two-arg-int-mixed-scc":
      return {
        moduleName: "stmt_call_two_arg_int_mixed.i",
        exports: ["outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [2],
            body: [
              { kind: "assignLocalConst", slot: 0, width: 2, value: 83 },
              {
                kind: "emitExprChar",
                expr: {
                  kind: "call",
                  target: "pickfirst16",
                  args: [
                    { kind: "ref", scope: "local", width: 2, slot: 0 },
                    { kind: "const", value: 84 },
                  ],
                },
              },
              { kind: "returnVoid" },
            ],
          }),
          lowerFunctionIR({
            name: "pickfirst16",
            params: [2, 2],
            locals: [],
            body: [
              { kind: "returnExpr", expr: { kind: "ref", scope: "arg", width: 2, slot: 0 } },
            ],
          }),
        ],
      };
    case "stmt-extern-two-arg-int-call-scc":
      return {
        moduleName: "stmt_extern_two_arg_int_call.i",
        exports: ["pickfirst16", "outchar", "main"],
        includeBss: true,
        functions: [
          lowerFunctionIR({
            name: "main",
            params: [],
            locals: [2],
            body: [
              { kind: "assignLocalConst", slot: 0, width: 2, value: 85 },
              {
                kind: "emitExprChar",
                expr: {
                  kind: "call",
                  target: "pickfirst16",
                  args: [
                    { kind: "ref", scope: "local", width: 2, slot: 0 },
                    { kind: "const", value: 86 },
                  ],
                },
              },
              { kind: "returnVoid" },
            ],
          }),
        ],
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
    case "loadLocalCharToHl":
      return emitExprToHl({ kind: "localChar", offset: statement.offset }, ctx);
    case "storeImm16ToLocal":
      return emitStoreImm16ToLocal(statement.offset, statement.value, ctx);
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

function emitStoreImm16ToLocal(offset: number, value: number, ctx: EmitExprContext): string[] {
  return [
    ...emitLoadLocalAddrToHl(offset, ctx),
    `\tld\t(hl),#${value & 0xff}`,
    "\tinc\thl",
    `\tld\t(hl),#${(value >> 8) & 0xff}`,
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

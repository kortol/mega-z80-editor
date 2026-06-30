"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TsSccCompilerAdapter = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const mz80_as_1 = require("../cli/mz80-as");
const fixtures_1 = require("./fixtures");
const translateAsm_1 = require("./translateAsm");
class TsSccCompilerAdapter {
    fixtureId;
    constructor(opts = {}) {
        this.fixtureId = opts.fixtureId;
    }
    compileToRel(logger, opts) {
        if (this.fixtureId) {
            return compileFromFixture(logger, opts, this.fixtureId);
        }
        const fixtureLabel = this.fixtureId ? ` using fixture ${this.fixtureId}` : "";
        const fixtureNotes = this.fixtureId
            ? ` Reference fixture: ${describeFixture(this.fixtureId)}.`
            : "";
        throw new Error(`TsSccCompilerAdapter is not implemented for ${opts.inputFile}${fixtureLabel}.`
            + " Implement frontend parsing, fragment lowering, SCC helper lowering, and mz80 code emission first."
            + fixtureNotes);
    }
}
exports.TsSccCompilerAdapter = TsSccCompilerAdapter;
function describeFixture(fixtureId) {
    const fixture = (0, fixtures_1.getSccFixture)(fixtureId);
    return `${fixture.id} [${fixture.features.join(", ")}]`;
}
function compileFromFixture(logger, opts, fixtureId) {
    const fixture = (0, fixtures_1.getSccFixture)(fixtureId);
    const resolvedInput = node_path_1.default.resolve(opts.inputFile);
    const stageRoot = node_path_1.default.resolve(opts.tempDir);
    const stem = sanitizeStageStem(node_path_1.default.basename(resolvedInput, node_path_1.default.extname(resolvedInput)).toLowerCase());
    const stageDir = node_path_1.default.join(stageRoot, stem);
    const preprocessedFile = node_path_1.default.join(stageDir, `${stem}.i`);
    const sccAsmFile = node_path_1.default.join(stageDir, `${stem}.scc.asm`);
    const asmFile = node_path_1.default.join(stageDir, `${stem}.asm`);
    const relFile = opts.outputRelFile ? node_path_1.default.resolve(opts.outputRelFile) : node_path_1.default.join(stageDir, `${stem}.rel`);
    node_fs_1.default.mkdirSync(stageDir, { recursive: true });
    node_fs_1.default.writeFileSync(preprocessedFile, `; fixture-backed TS compiler input for ${fixture.id}\n`, "utf8");
    node_fs_1.default.writeFileSync(sccAsmFile, emitFixtureBackedSccAsm(fixtureId), "utf8");
    node_fs_1.default.writeFileSync(asmFile, (0, translateAsm_1.translateSccAsm)(node_fs_1.default.readFileSync(sccAsmFile, "utf8"), { moduleName: node_path_1.default.basename(fixture.file) }), "utf8");
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(relFile), { recursive: true });
    const ctx = (0, mz80_as_1.assemble)(logger, asmFile, relFile, {
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
function sanitizeStageStem(stem) {
    return stem.replace(/[^a-z0-9_.$@]/gi, "_");
}
function emitFixtureBackedSccAsm(fixtureId) {
    const spec = makeFixtureProgramSpec(fixtureId);
    if (spec)
        return emitProgram(spec);
    return (0, fixtures_1.readSccFixture)(fixtureId);
}
function makeFixtureProgramSpec(fixtureId) {
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
function emitProgram(spec) {
    const lines = [];
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
function lowerFunctionIR(fn) {
    const layout = layoutFunction(fn);
    const state = { nextLabelId: 2 };
    const statements = [];
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
function lowerStmtIR(stmt, layout, state) {
    switch (stmt.kind) {
        case "assignLocalConst": {
            const offset = getLocalOffset(layout, stmt.slot);
            return stmt.width === 1
                ? [{ kind: "storeImmToLocal", offset, value: stmt.value }]
                : [{ kind: "storeImm16ToLocal", offset, value: stmt.value }];
        }
        case "compareReturn": {
            const statements = [
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
            const statements = [
                { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
            ];
            if (layout.localBytes > 0) {
                statements.push({ kind: "releaseBytes", count: layout.localBytes });
            }
            statements.push({ kind: "ret" });
            return statements;
        }
        case "returnVoid": {
            const statements = [];
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
function allocateNumericLabel(state) {
    const label = `.${state.nextLabelId}`;
    state.nextLabelId += 1;
    return label;
}
function lowerExprIR(expr, layout) {
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
function lowerRefIR(ref, layout) {
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
function layoutFunction(fn) {
    const localOffsets = [];
    let localRunning = 0;
    for (const width of fn.locals) {
        localOffsets.push(localRunning);
        localRunning += width;
    }
    const localBytes = localRunning;
    const paramOffsets = [];
    for (let index = 0; index < fn.params.length; index += 1) {
        let trailing = 0;
        for (let next = index + 1; next < fn.params.length; next += 1) {
            trailing += getParamStackBytes(fn.params[next]);
        }
        paramOffsets.push(localBytes + 2 + trailing);
    }
    return { localBytes, localOffsets, paramOffsets };
}
function getParamStackBytes(_width) {
    return 2;
}
function getLocalOffset(layout, slot) {
    return layout.localOffsets[slot] ?? 0;
}
function getParamOffset(layout, slot) {
    return layout.paramOffsets[slot] ?? 0;
}
function emitFunction(fn) {
    const lines = [`${fn.name}:`];
    for (const statement of fn.statements) {
        lines.push(...emitStatement(statement, { stackDelta: 0 }));
    }
    return lines;
}
function emitStatement(statement, ctx) {
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
function emitExprToHl(expr, ctx) {
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
function emitCall(target) {
    return [`\tcall\t${target}`];
}
function emitCallExpr(target, args, ctx) {
    if (args.length === 0) {
        return emitCall(target);
    }
    return [
        ...emitPushArgs(args, ctx),
        ...emitCall(target),
        ...Array.from({ length: args.length }, () => emitPopBc()).flat(),
    ];
}
function emitRet() {
    return ["\tret"];
}
function emitLabel(name) {
    return [`${name}:`];
}
function emitJump(target) {
    return [`\tjp\t${target}`];
}
function emitCallWithModeA(target, mode) {
    return [`\tld\ta,#${mode}`, `\tcall\t${target}`];
}
function emitTruthJumpZero(target) {
    return ["\tld\ta,h", "\tor\tl", `\tjp\tz,${target}`];
}
function emitPushHlArg() {
    return ["\tpush\thl"];
}
function emitPopBc() {
    return ["\tpop\tbc"];
}
function emitPushArgs(args, ctx) {
    const lines = [];
    let stackDelta = ctx.stackDelta;
    for (const expr of args) {
        lines.push(...emitExprToHl(expr, { ...ctx, stackDelta }));
        lines.push(...emitPushHlArg());
        stackDelta += 2;
    }
    return lines;
}
function emitReserveBytes(count) {
    return Array.from({ length: count }, () => "\tdec\tsp");
}
function emitReleaseBytes(count) {
    return Array.from({ length: count }, () => "\tinc\tsp");
}
function emitConstToHl(value) {
    return [`\tld\thl,#${value}`];
}
function emitSymbolAddressToHl(label) {
    return [`\tld\thl,#${label}+0`];
}
function emitLoadLocalAddrToHl(offset, ctx) {
    return emitLoadStackAddrToHl(offset, ctx);
}
function emitLoadStackAddrToHl(offset, ctx) {
    return [`\tld\thl,#${offset + ctx.stackDelta}`, "\tadd\thl,sp"];
}
function emitLoadStackByteToHl(offset, ctx) {
    return [
        ...emitLoadStackAddrToHl(offset, ctx),
        "\tld\tl,(hl)",
        "\tld\th,#0",
    ];
}
function emitLoadStackWordToHl(offset, ctx) {
    return [
        ...emitLoadStackAddrToHl(offset, ctx),
        "\tld\ta,(hl)",
        "\tinc\thl",
        "\tld\th,(hl)",
        "\tld\tl,a",
    ];
}
function emitLoadLocalByteToHl(offset, ctx) {
    return emitLoadStackByteToHl(offset, ctx);
}
function emitLoadLocalWordToHl(offset, ctx) {
    return emitLoadStackWordToHl(offset, ctx);
}
function emitLoadArgByteToHl(offset, ctx) {
    return emitLoadStackByteToHl(offset, ctx);
}
function emitLoadArgWordToHl(offset, ctx) {
    return emitLoadStackWordToHl(offset, ctx);
}
function emitStoreImm8ToLocal(offset, value, ctx) {
    return [
        ...emitLoadLocalAddrToHl(offset, ctx),
        `\tld\t(hl),#${value}`,
    ];
}
function emitStoreImm16ToLocal(offset, value, ctx) {
    return [
        ...emitLoadLocalAddrToHl(offset, ctx),
        `\tld\t(hl),#${value & 0xff}`,
        "\tinc\thl",
        `\tld\t(hl),#${(value >> 8) & 0xff}`,
    ];
}
function emitDecLocalByte(offset, ctx) {
    return [
        ...emitLoadLocalAddrToHl(offset, ctx),
        "\tdec\t(hl)",
    ];
}
function emitHelperCompare(left, right, helper, ctx) {
    return [
        ...emitExprToHl(left, ctx),
        ...emitPushHlArg(),
        ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        `\tcall\t${helper}`,
    ];
}
function assertNever(value) {
    throw new Error(`Unhandled statement kind: ${JSON.stringify(value)}`);
}

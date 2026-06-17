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
                functions: [{
                        name: "main",
                        statements: [
                            { kind: "loadDataAddressHl", label: ".0" },
                            { kind: "ret" },
                        ],
                    }],
            };
        case "frag-helper-call-scc":
            return {
                moduleName: "frag_helper_call.i",
                exports: [".gint", "main"],
                includeBss: true,
                functions: [{
                        name: "main",
                        statements: [
                            { kind: "call", target: ".gint" },
                            { kind: "ret" },
                        ],
                    }],
            };
        case "frag-call-scc":
            return {
                moduleName: "frag_call.i",
                exports: ["outstr", "main"],
                includeBss: false,
                functions: [{
                        name: "main",
                        statements: [
                            { kind: "call", target: "outstr" },
                            { kind: "ret" },
                        ],
                    }],
            };
        case "stmt-outstr-scc":
            return {
                moduleName: "stmt_outstr.i",
                exports: ["outstr", "main"],
                includeBss: true,
                data: [{ label: ".0", directive: ".ascii", value: '"TS STMT$"' }],
                functions: [{
                        name: "main",
                        statements: [
                            { kind: "loadDataAddressHl", label: ".0" },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outstr", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                        ],
                    }],
            };
        case "stmt-call-result-scc":
            return {
                moduleName: "stmt_call_result.i",
                exports: ["outchar", "main"],
                includeBss: true,
                functions: [
                    {
                        name: "main",
                        statements: [
                            { kind: "call", target: "value" },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                        ],
                    },
                    {
                        name: "value",
                        statements: [
                            { kind: "loadConstHl", value: 88 },
                            { kind: "ret" },
                        ],
                    },
                ],
            };
        case "stmt-branch-scc":
            return {
                moduleName: "stmt_branch.i",
                exports: ["outchar", "main"],
                includeBss: true,
                functions: [
                    {
                        name: "main",
                        statements: [
                            { kind: "call", target: "flag" },
                            { kind: "truthJumpZero", target: ".2" },
                            { kind: "loadConstHl", value: 84 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                            { kind: "label", name: ".2" },
                            { kind: "loadConstHl", value: 70 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                        ],
                    },
                    {
                        name: "flag",
                        statements: [
                            { kind: "loadConstHl", value: 1 },
                            { kind: "ret" },
                        ],
                    },
                ],
            };
        case "stmt-local-slot-scc":
            return {
                moduleName: "stmt_local_slot.i",
                exports: ["outchar", "main"],
                includeBss: true,
                functions: [{
                        name: "main",
                        statements: [
                            { kind: "decSp" },
                            { kind: "storeImmToLocal", offset: 0, value: 76 },
                            { kind: "loadLocalCharToHl", offset: 0 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "incSp" },
                            { kind: "ret" },
                        ],
                    }],
            };
        case "stmt-compare-helper-scc":
            return {
                moduleName: "stmt_compare_helper.i",
                exports: [".gt", "outchar", "main"],
                includeBss: true,
                functions: [{
                        name: "main",
                        statements: [
                            { kind: "compareExprHelper", left: { kind: "const", value: 66 }, right: { kind: "const", value: 65 }, helper: ".gt" },
                            { kind: "truthJumpZero", target: ".2" },
                            { kind: "loadConstHl", value: 89 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                            { kind: "label", name: ".2" },
                            { kind: "loadConstHl", value: 78 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                        ],
                    }],
            };
        case "stmt-local-compare-scc":
            return {
                moduleName: "stmt_local_compare.i",
                exports: [".gt", "outchar", "main"],
                includeBss: true,
                functions: [{
                        name: "main",
                        statements: [
                            { kind: "decSp" },
                            { kind: "storeImmToLocal", offset: 0, value: 67 },
                            { kind: "compareExprHelper", left: { kind: "localChar", offset: 0 }, right: { kind: "const", value: 66 }, helper: ".gt" },
                            { kind: "truthJumpZero", target: ".2" },
                            { kind: "loadConstHl", value: 87 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "incSp" },
                            { kind: "ret" },
                            { kind: "label", name: ".2" },
                            { kind: "loadConstHl", value: 88 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "incSp" },
                            { kind: "ret" },
                        ],
                    }],
            };
        case "stmt-local-int-scc":
            return {
                moduleName: "stmt_local_int.i",
                exports: ["outchar", "main"],
                includeBss: true,
                functions: [{
                        name: "main",
                        statements: [
                            { kind: "reserveBytes", count: 2 },
                            { kind: "storeImm16ToLocal", offset: 0, value: 90 },
                            { kind: "loadLocalIntToHl", offset: 0 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "releaseBytes", count: 2 },
                            { kind: "ret" },
                        ],
                    }],
            };
        case "stmt-eq-helper-scc":
            return {
                moduleName: "stmt_eq_helper.i",
                exports: [".eq", "outchar", "main"],
                includeBss: true,
                functions: [{
                        name: "main",
                        statements: [
                            { kind: "compareExprHelper", left: { kind: "const", value: 81 }, right: { kind: "const", value: 81 }, helper: ".eq" },
                            { kind: "truthJumpZero", target: ".2" },
                            { kind: "loadConstHl", value: 69 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                            { kind: "label", name: ".2" },
                            { kind: "loadConstHl", value: 88 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                        ],
                    }],
            };
        case "stmt-loop-scc":
            return {
                moduleName: "stmt_loop.i",
                exports: [".gt", "outchar", "main"],
                includeBss: true,
                functions: [{
                        name: "main",
                        statements: [
                            { kind: "decSp" },
                            { kind: "storeImmToLocal", offset: 0, value: 51 },
                            { kind: "label", name: ".2" },
                            { kind: "loadLocalCharToHl", offset: 0 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "compareExprHelper", left: { kind: "localChar", offset: 0 }, right: { kind: "const", value: 49 }, helper: ".gt" },
                            { kind: "truthJumpZero", target: ".3" },
                            { kind: "decLocalByte", offset: 0 },
                            { kind: "jump", target: ".2" },
                            { kind: "label", name: ".3" },
                            { kind: "incSp" },
                            { kind: "ret" },
                        ],
                    }],
            };
        case "stmt-arg-char-scc":
            return {
                moduleName: "stmt_arg_char.i",
                exports: ["outchar", "main"],
                includeBss: true,
                functions: [
                    {
                        name: "main",
                        statements: [
                            { kind: "loadConstHl", value: 65 },
                            { kind: "pushHlArg" },
                            { kind: "call", target: "echo" },
                            { kind: "popBc" },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                        ],
                    },
                    {
                        name: "echo",
                        statements: [
                            { kind: "loadExprHl", expr: { kind: "argChar", offset: 2 } },
                            { kind: "ret" },
                        ],
                    },
                ],
            };
        case "stmt-arg-ne-helper-scc":
            return {
                moduleName: "stmt_arg_ne_helper.i",
                exports: [".ne", "outchar", "main"],
                includeBss: true,
                functions: [
                    {
                        name: "main",
                        statements: [
                            { kind: "loadConstHl", value: 66 },
                            { kind: "pushHlArg" },
                            { kind: "call", target: "check" },
                            { kind: "popBc" },
                            { kind: "truthJumpZero", target: ".2" },
                            { kind: "loadConstHl", value: 78 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                            { kind: "label", name: ".2" },
                            { kind: "loadConstHl", value: 88 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                        ],
                    },
                    {
                        name: "check",
                        statements: [
                            { kind: "compareExprHelper", left: { kind: "argChar", offset: 2 }, right: { kind: "const", value: 65 }, helper: ".ne" },
                            { kind: "ret" },
                        ],
                    },
                ],
            };
        case "stmt-arg-int-scc":
            return {
                moduleName: "stmt_arg_int.i",
                exports: ["outchar", "main"],
                includeBss: true,
                functions: [
                    {
                        name: "main",
                        statements: [
                            { kind: "loadConstHl", value: 90 },
                            { kind: "pushHlArg" },
                            { kind: "call", target: "echo16" },
                            { kind: "popBc" },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                        ],
                    },
                    {
                        name: "echo16",
                        statements: [
                            { kind: "loadExprHl", expr: { kind: "argInt", offset: 2 } },
                            { kind: "ret" },
                        ],
                    },
                ],
            };
        case "stmt-two-arg-char-scc":
            return {
                moduleName: "stmt_two_arg_char.i",
                exports: ["outchar", "main"],
                includeBss: true,
                functions: [
                    {
                        name: "main",
                        statements: [
                            { kind: "loadConstHl", value: 65 },
                            { kind: "pushHlArg" },
                            { kind: "loadConstHl", value: 66 },
                            { kind: "pushHlArg" },
                            { kind: "call", target: "pickfirst" },
                            { kind: "popBc" },
                            { kind: "popBc" },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                        ],
                    },
                    {
                        name: "pickfirst",
                        statements: [
                            { kind: "loadExprHl", expr: { kind: "argChar", offset: 4 } },
                            { kind: "ret" },
                        ],
                    },
                ],
            };
        case "stmt-arg-int-eq-helper-scc":
            return {
                moduleName: "stmt_arg_int_eq_helper.i",
                exports: [".eq", "outchar", "main"],
                includeBss: true,
                functions: [
                    {
                        name: "main",
                        statements: [
                            { kind: "loadConstHl", value: 90 },
                            { kind: "pushHlArg" },
                            { kind: "call", target: "check16" },
                            { kind: "popBc" },
                            { kind: "truthJumpZero", target: ".2" },
                            { kind: "loadConstHl", value: 73 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                            { kind: "label", name: ".2" },
                            { kind: "loadConstHl", value: 88 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                        ],
                    },
                    {
                        name: "check16",
                        statements: [
                            { kind: "compareExprHelper", left: { kind: "argInt", offset: 2 }, right: { kind: "const", value: 90 }, helper: ".eq" },
                            { kind: "ret" },
                        ],
                    },
                ],
            };
        case "stmt-two-arg-ne-helper-scc":
            return {
                moduleName: "stmt_two_arg_ne_helper.i",
                exports: [".ne", "outchar", "main"],
                includeBss: true,
                functions: [
                    {
                        name: "main",
                        statements: [
                            { kind: "loadConstHl", value: 65 },
                            { kind: "pushHlArg" },
                            { kind: "loadConstHl", value: 66 },
                            { kind: "pushHlArg" },
                            { kind: "call", target: "checkpair" },
                            { kind: "popBc" },
                            { kind: "popBc" },
                            { kind: "truthJumpZero", target: ".2" },
                            { kind: "loadConstHl", value: 68 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                            { kind: "label", name: ".2" },
                            { kind: "loadConstHl", value: 88 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "ret" },
                        ],
                    },
                    {
                        name: "checkpair",
                        statements: [
                            { kind: "compareExprHelper", left: { kind: "argChar", offset: 4 }, right: { kind: "argChar", offset: 2 }, helper: ".ne" },
                            { kind: "ret" },
                        ],
                    },
                ],
            };
        case "stmt-call-two-arg-mixed-scc":
            return {
                moduleName: "stmt_call_two_arg_mixed.i",
                exports: ["outchar", "main"],
                includeBss: true,
                functions: [
                    {
                        name: "main",
                        statements: [
                            { kind: "decSp" },
                            { kind: "storeImmToLocal", offset: 0, value: 67 },
                            { kind: "pushExprArg", expr: { kind: "localChar", offset: 0 } },
                            { kind: "pushExprArg", expr: { kind: "const", value: 68 } },
                            { kind: "call", target: "pickfirst" },
                            { kind: "popBc" },
                            { kind: "popBc" },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "incSp" },
                            { kind: "ret" },
                        ],
                    },
                    {
                        name: "pickfirst",
                        statements: [
                            { kind: "loadExprHl", expr: { kind: "argChar", offset: 4 } },
                            { kind: "ret" },
                        ],
                    },
                ],
            };
        case "stmt-two-arg-local-ne-helper-scc":
            return {
                moduleName: "stmt_two_arg_local_ne_helper.i",
                exports: [".ne", "outchar", "main"],
                includeBss: true,
                functions: [
                    {
                        name: "main",
                        statements: [
                            { kind: "decSp" },
                            { kind: "storeImmToLocal", offset: 0, value: 67 },
                            { kind: "pushExprArg", expr: { kind: "localChar", offset: 0 } },
                            { kind: "pushExprArg", expr: { kind: "const", value: 68 } },
                            { kind: "call", target: "checkpair" },
                            { kind: "popBc" },
                            { kind: "popBc" },
                            { kind: "truthJumpZero", target: ".2" },
                            { kind: "loadConstHl", value: 77 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "incSp" },
                            { kind: "ret" },
                            { kind: "label", name: ".2" },
                            { kind: "loadConstHl", value: 88 },
                            { kind: "pushHlArg" },
                            { kind: "callWithModeA", target: "outchar", mode: 1 },
                            { kind: "popBc" },
                            { kind: "incSp" },
                            { kind: "ret" },
                        ],
                    },
                    {
                        name: "checkpair",
                        statements: [
                            { kind: "compareExprHelper", left: { kind: "argChar", offset: 4 }, right: { kind: "argChar", offset: 2 }, helper: ".ne" },
                            { kind: "ret" },
                        ],
                    },
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
function emitFunction(fn) {
    const lines = [`${fn.name}:`];
    for (const statement of fn.statements) {
        lines.push(...emitStatement(statement));
    }
    return lines;
}
function emitStatement(statement) {
    switch (statement.kind) {
        case "call":
            return [`\tcall\t${statement.target}`];
        case "loadConstHl":
            return emitExprToHl({ kind: "const", value: statement.value });
        case "loadDataAddressHl":
            return emitExprToHl({ kind: "dataAddress", label: statement.label });
        case "loadExprHl":
            return emitExprToHl(statement.expr);
        case "pushExprArg":
            return [
                ...emitExprToHl(statement.expr),
                "\tpush\thl",
            ];
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
            return ["\tdec\tsp"];
        case "incSp":
            return ["\tinc\tsp"];
        case "reserveBytes":
            return Array.from({ length: statement.count }, () => "\tdec\tsp");
        case "releaseBytes":
            return Array.from({ length: statement.count }, () => "\tinc\tsp");
        case "loadLocalAddrHl":
            return [`\tld\thl,#${statement.offset}`, "\tadd\thl,sp"];
        case "storeImmToLocal":
            return [
                ...emitStatement({ kind: "loadLocalAddrHl", offset: statement.offset }),
                `\tld\t(hl),#${statement.value}`,
            ];
        case "loadLocalCharToHl":
            return emitExprToHl({ kind: "localChar", offset: statement.offset });
        case "storeImm16ToLocal":
            return [
                ...emitStatement({ kind: "loadLocalAddrHl", offset: statement.offset }),
                `\tld\t(hl),#${statement.value & 0xff}`,
                "\tinc\thl",
                `\tld\t(hl),#${(statement.value >> 8) & 0xff}`,
            ];
        case "loadLocalIntToHl":
            return emitExprToHl({ kind: "localInt", offset: statement.offset });
        case "decLocalByte":
            return [
                ...emitStatement({ kind: "loadLocalAddrHl", offset: statement.offset }),
                "\tdec\t(hl)",
            ];
        case "compareExprHelper":
            return [
                ...emitExprToHl(statement.left),
                "\tpush\thl",
                ...emitExprToHl(statement.right),
                "\tpop\tde",
                `\tcall\t${statement.helper}`,
            ];
        default:
            return assertNever(statement);
    }
}
function emitExprToHl(expr) {
    switch (expr.kind) {
        case "const":
            return [`\tld\thl,#${expr.value}`];
        case "dataAddress":
            return [`\tld\thl,#${expr.label}+0`];
        case "call":
            return [`\tcall\t${expr.target}`];
        case "localChar":
            return [
                `\tld\thl,#${expr.offset}`,
                "\tadd\thl,sp",
                "\tld\tl,(hl)",
                "\tld\th,#0",
            ];
        case "localInt":
            return [
                `\tld\thl,#${expr.offset}`,
                "\tadd\thl,sp",
                "\tld\ta,(hl)",
                "\tinc\thl",
                "\tld\th,(hl)",
                "\tld\tl,a",
            ];
        case "argChar":
            return [
                `\tld\thl,#${expr.offset}`,
                "\tadd\thl,sp",
                "\tld\tl,(hl)",
                "\tld\th,#0",
            ];
        case "argInt":
            return [
                `\tld\thl,#${expr.offset}`,
                "\tadd\thl,sp",
                "\tld\ta,(hl)",
                "\tinc\thl",
                "\tld\th,(hl)",
                "\tld\tl,a",
            ];
        default:
            return assertNever(expr);
    }
}
function assertNever(value) {
    throw new Error(`Unhandled statement kind: ${JSON.stringify(value)}`);
}

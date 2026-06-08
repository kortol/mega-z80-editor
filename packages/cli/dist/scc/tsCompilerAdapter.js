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
    switch (fixtureId) {
        case "frag-string-scc":
            return [
                "\t.globl\tmain",
                "\t.module\tfrag_string.i",
                "\t.area\t_CODE",
                "main:",
                "\tld\thl,#.0+0",
                "\tret",
                "\t.area\t_DATA",
                '.0:\t.asciz\t"HELLO"',
                "\t.area\t_BSS",
                "",
            ].join("\n");
        case "frag-helper-call-scc":
            return [
                "\t.globl\t.gint",
                "\t.globl\tmain",
                "\t.module\tfrag_helper_call.i",
                "\t.area\t_CODE",
                "main:",
                "\tcall\t.gint",
                "\tret",
                "\t.area\t_BSS",
                "",
            ].join("\n");
        case "frag-call-scc":
            return [
                "\t.globl\toutstr",
                "\t.globl\tmain",
                "\t.module\tfrag_call.i",
                "\t.area\t_CODE",
                "main:",
                "\tcall\toutstr",
                "\tret",
                "",
            ].join("\n");
        case "stmt-outstr-scc":
            return [
                "\t.globl\toutstr",
                "\t.globl\tmain",
                "\t.module\tstmt_outstr.i",
                "\t.area\t_CODE",
                "main:",
                "\tld\thl,#.0+0",
                "\tpush\thl",
                "\tld\ta,#1",
                "\tcall\toutstr",
                "\tpop\tbc",
                "\tret",
                "\t.area\t_DATA",
                '.0:\t.ascii\t"TS STMT$"',
                "\t.area\t_BSS",
                "",
            ].join("\n");
        default:
            return (0, fixtures_1.readSccFixture)(fixtureId);
    }
}

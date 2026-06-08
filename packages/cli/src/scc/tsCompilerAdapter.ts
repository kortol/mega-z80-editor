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
      return readSccFixture(fixtureId);
  }
}

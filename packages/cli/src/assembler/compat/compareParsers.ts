import fs from "fs";
import path from "path";
import { createLogger } from "../../logger";
import { assemble } from "../../cli/mz80-as";
import { AsmOptions } from "../../assembler-old/context";

export type RunResult = {
  errors: string[];
  warnings: string[];
  outputs: OutputFiles;
  exception?: string;
};

export type OutputFiles = {
  rel?: string;
  lst?: string;
  sym?: string;
};

export type CompareOptions = {
  keepTemp?: boolean;
  relVersion?: 1 | 2;
};

function formatError(err: any): string {
  if (!err) return "";
  const msg = err?.message ? String(err.message) : String(err);

  const loc = err?.location ?? err?.loc ?? err?.pos;
  if (loc && typeof loc === "object") {
    const line = loc.start?.line ?? loc.line ?? (loc.parent ? loc.parent.line : undefined);
    const column = loc.start?.column ?? loc.column;
    if (line !== undefined && column !== undefined) {
      return `${msg} (line ${line}, column ${column})`;
    }
  }

  return msg;
}

function readIfExists(p: string): string | undefined {
  if (!fs.existsSync(p)) return undefined;
  return fs.readFileSync(p, "utf-8");
}

function runOnce(
  name: string,
  src: string,
  tag: string,
  outDir: string,
  opts?: CompareOptions,
  virtualFiles?: Map<string, string>,
): RunResult {
  const logger = createLogger("quiet");
  const relPath = path.join(outDir, `${name}.${tag}.rel`);

  const options: AsmOptions = {
    relVersion: opts?.relVersion ?? 2,
    virtualFiles,
  };

  const tmpAsm = path.join(outDir, `${name}.${tag}.asm`);
  fs.writeFileSync(tmpAsm, src, "utf-8");
  try {
    const ctx = assemble(logger, tmpAsm, relPath, options);

    return {
      errors: ctx.errors.map(e => `${e.code}:${e.message}`),
      warnings: ctx.warnings.map(w => `${w.code}:${w.message}`),
      outputs: {
        rel: readIfExists(relPath),
        lst: readIfExists(relPath.replace(/\.rel$/i, ".lst")),
        sym: readIfExists(relPath.replace(/\.rel$/i, ".sym")),
      },
    };
  } catch (err: any) {
    return {
      errors: [],
      warnings: [],
      outputs: {},
      exception: formatError(err),
    };
  } finally {
    try {
      fs.unlinkSync(tmpAsm);
    } catch {
      /* ignore */
    }
  }
}

function runFileOnce(
  name: string,
  inputFile: string,
  tag: string,
  outDir: string,
  opts?: CompareOptions,
): RunResult {
  const logger = createLogger("quiet");
  const relPath = path.join(outDir, `${name}.${tag}.rel`);

  const options: AsmOptions = {
    relVersion: opts?.relVersion ?? 2,
  };

  try {
    const ctx = assemble(logger, inputFile, relPath, options);
    return {
      errors: ctx.errors.map(e => `${e.code}:${e.message}`),
      warnings: ctx.warnings.map(w => `${w.code}:${w.message}`),
      outputs: {
        rel: readIfExists(relPath),
        lst: readIfExists(relPath.replace(/\.rel$/i, ".lst")),
        sym: readIfExists(relPath.replace(/\.rel$/i, ".sym")),
      },
    };
  } catch (err: any) {
    return {
      errors: [],
      warnings: [],
      outputs: {},
      exception: String(err?.message ?? err),
    };
  }
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function makeRunDir(label: string): string {
  const root = path.join(process.cwd(), ".tmp_peg_compare");
  ensureDir(root);
  const safe = label.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48);
  const prefix = path.join(root, `run_${safe}_`);
  return fs.mkdtempSync(prefix);
}

export function runPegSource(
  name: string,
  src: string,
  opts?: CompareOptions,
  virtualFiles?: Map<string, string>
): RunResult {
  const base = makeRunDir(`runPegSource_${name}`);
  const peg = runOnce(name, src, "peg", base, opts, virtualFiles);
  if (!opts?.keepTemp) {
    try {
      fs.rmSync(base, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  return peg;
}

export function runPegFile(
  name: string,
  inputFile: string,
  opts?: CompareOptions,
): RunResult {
  const base = makeRunDir(`runPegFile_${name}`);
  const peg = runFileOnce(name, inputFile, "peg", base, opts);
  if (!opts?.keepTemp) {
    try {
      fs.rmSync(base, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  return peg;
}

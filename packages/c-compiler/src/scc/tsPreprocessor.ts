import fs from "node:fs";
import path from "node:path";
import { MacroTable, expand, evaluateCondition, stripComments } from "./tsMacro";

export type TsPreprocessOptions = { includeDirs?: string[]; defines?: Record<string, string>; bundledIncludeDirs?: string[] };
export type TsPreprocessResult = { sourceText: string; runtimeVariadicNames: ReadonlySet<string> };

/** Token-aware preprocessing for user and bundled headers in the fixed C Subset. */
export function preprocessTsCSource(input: string, file: string, opts: TsPreprocessOptions = {}): TsPreprocessResult {
  const macros: MacroTable = new Map(Object.entries(opts.defines ?? {}).map(([name, body]) => [name, { body }]));
  const bundledDirs = new Set((opts.bundledIncludeDirs ?? []).map((entry) => path.resolve(entry)));
  const runtimeVariadicNames = new Set<string>();
  const stack: string[] = [];
  const process = (source: string, sourceFile: string): string => {
    const resolved = path.resolve(sourceFile);
    // A guarded recursive include is valid; the guard suppresses its body.
    if (stack.length >= 64) throw new Error(`TsSccCompilerAdapter preprocessor include cycle/depth limit: ${[...stack, resolved].join(" -> ")}`);
    stack.push(resolved);
    const output: string[] = [];
    let pending: string[] = [];
    const flush = () => { if (pending.length) output.push(expand(pending.join("\n"), macros)); pending = []; };
    const conditions: Array<{ parent: boolean; value: boolean; taken: boolean; sawElse: boolean }> = [];
    const active = () => conditions.every((entry) => entry.parent && entry.value);
    for (const line of stripComments(source.replace(/\\\r?\n/g, "")).split(/\r?\n/)) {
      if (/^\s*#\s*$/.test(line)) { pending.push(""); continue; }
      const directive = /^\s*#\s*([A-Za-z]+)(.*)$/.exec(line);
      if (!directive) { pending.push(active() ? line : ""); continue; }
      flush();
      const [, command, restRaw] = directive;
      const rest = restRaw.trim();
      if (command === "ifdef" || command === "ifndef" || command === "if") {
        const parent = active();
        const value = parent && (command === "ifdef" ? macros.has(rest) : command === "ifndef" ? !macros.has(rest) : evaluateCondition(rest, macros));
        conditions.push({ parent, value, taken: value, sawElse: false }); output.push(""); continue;
      }
      if (command === "elif") {
        const current = conditions.at(-1);
        if (!current || current.sawElse) throw new Error(`TsSccCompilerAdapter preprocessor invalid #elif in ${resolved}.`);
        current.value = current.parent && !current.taken && evaluateCondition(rest, macros);
        current.taken ||= current.value; output.push(""); continue;
      }
      if (command === "else") {
        const current = conditions.at(-1);
        if (!current || current.sawElse || rest) throw new Error(`TsSccCompilerAdapter preprocessor invalid #else in ${resolved}.`);
        current.value = current.parent && !current.taken; current.taken = true; current.sawElse = true; output.push(""); continue;
      }
      if (command === "endif") {
        if (!conditions.pop() || rest) throw new Error(`TsSccCompilerAdapter preprocessor invalid #endif in ${resolved}.`);
        output.push(""); continue;
      }
      if (!active()) { output.push(""); continue; }
      if (command === "include") {
        const expanded = rest.startsWith('"') || rest.startsWith("<") ? rest : expand(rest, macros);
        const include = /^(?:"([^"]+)"|<([^>]+)>)$/.exec(expanded);
        if (!include) throw new Error(`TsSccCompilerAdapter preprocessor only supports quoted or angle #include in ${resolved}.`);
        const name = include[1] ?? include[2];
        const includeFile = resolveInclude(name, include[2] !== undefined, resolved, [...(opts.includeDirs ?? []), ...(opts.bundledIncludeDirs ?? [])]);
        if (!includeFile) throw new Error(`TsSccCompilerAdapter preprocessor cannot resolve include '${name}' from ${resolved}.`);
        if (path.basename(includeFile) === "stdio.h" && [...bundledDirs].some((dir) => includeFile.startsWith(`${dir}${path.sep}`)) && macros.has("MZ80_RUNTIME_FULL")) {
          runtimeVariadicNames.add("printf");
          runtimeVariadicNames.add("sprintf");
        }
        output.push(process(fs.readFileSync(includeFile, "utf8"), includeFile)); continue;
      }
      if (command === "define") {
        const functionMacro = /^([A-Za-z_]\w*)\(([^)]*)\)\s*(.*)$/.exec(rest);
        if (functionMacro) {
          const [, name, parameter, replacement] = functionMacro;
          const params = parameter.trim() ? parameter.split(",").map((item) => item.trim()) : [];
          if (new Set(params).size !== params.length || params.some((item) => !/^[A-Za-z_]\w*$/.test(item))) throw new Error(`Invalid macro parameters for '${name}'.`);
          if (opts.defines?.[name] !== undefined) throw new Error(`TsSccCompilerAdapter preprocessor cannot override configured define ${name}.`);
          macros.set(name, { params, body: replacement }); output.push(""); continue;
        }
        const match = /^([A-Za-z_]\w*)(?:\s+(.*))?$/.exec(rest);
        if (!match || rest.startsWith(`${match?.[1]}(`)) throw new Error(`TsSccCompilerAdapter preprocessor supports object-like #define only in ${resolved}.`);
        const [, name, value = ""] = match;
        if (opts.defines?.[name] !== undefined && opts.defines[name] !== value) throw new Error(`TsSccCompilerAdapter preprocessor cannot override configured define ${name}.`);
        macros.set(name, { body: value }); output.push(""); continue;
      }
      if (command === "undef") {
        if (!/^[A-Za-z_]\w*$/.test(rest)) throw new Error(`TsSccCompilerAdapter preprocessor invalid #undef in ${resolved}.`);
        if (opts.defines?.[rest] !== undefined) throw new Error(`TsSccCompilerAdapter preprocessor cannot undef configured define ${rest}.`);
        macros.delete(rest); output.push(""); continue;
      }
      throw new Error(`TsSccCompilerAdapter preprocessor does not support #${command} in ${resolved}.`);
    }
    flush();
    stack.pop();
    if (conditions.length) throw new Error(`TsSccCompilerAdapter preprocessor missing #endif in ${resolved}.`);
    return output.join("\n");
  };
  return { sourceText: process(input, file), runtimeVariadicNames };
}

function resolveInclude(name: string, angle: boolean, from: string, dirs: string[]): string | undefined {
  const candidates = [...(angle ? [] : [path.join(path.dirname(from), name)]), ...dirs.map((dir) => path.join(path.resolve(dir), name))];
  return candidates.find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
}

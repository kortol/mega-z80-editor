"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.preprocessTsCSource = preprocessTsCSource;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
/** Small, intentionally non-general preprocessor for bundled C runtime headers. */
function preprocessTsCSource(input, file, opts = {}) {
    const macros = new Map(Object.entries(opts.defines ?? {}));
    const bundledDirs = new Set((opts.bundledIncludeDirs ?? []).map((entry) => node_path_1.default.resolve(entry)));
    const runtimeVariadicNames = new Set();
    const stack = [];
    const process = (source, sourceFile) => {
        const resolved = node_path_1.default.resolve(sourceFile);
        if (stack.includes(resolved))
            throw new Error(`TsSccCompilerAdapter preprocessor include cycle: ${[...stack, resolved].join(" -> ")}`);
        stack.push(resolved);
        const output = [];
        const conditions = [];
        const active = () => conditions.every((entry) => entry.parent && entry.value);
        for (const line of source.split(/\r?\n/)) {
            const directive = /^\s*#\s*([A-Za-z]+)(.*)$/.exec(line);
            if (!directive) {
                output.push(active() ? expandMacros(line, macros) : "");
                continue;
            }
            const [, command, restRaw] = directive;
            const rest = restRaw.trim();
            if (command === "ifdef" || command === "ifndef" || command === "if") {
                const value = command === "ifdef" ? macros.has(rest) : command === "ifndef" ? !macros.has(rest) : evaluateIf(rest, macros);
                conditions.push({ parent: active(), value, sawElse: false });
                output.push("");
                continue;
            }
            if (command === "else") {
                const current = conditions.at(-1);
                if (!current || current.sawElse || rest)
                    throw new Error(`TsSccCompilerAdapter preprocessor invalid #else in ${resolved}.`);
                current.value = !current.value;
                current.sawElse = true;
                output.push("");
                continue;
            }
            if (command === "endif") {
                if (!conditions.pop() || rest)
                    throw new Error(`TsSccCompilerAdapter preprocessor invalid #endif in ${resolved}.`);
                output.push("");
                continue;
            }
            if (!active()) {
                output.push("");
                continue;
            }
            if (command === "include") {
                const include = /^(?:"([^"]+)"|<([^>]+)>)$/.exec(rest);
                if (!include)
                    throw new Error(`TsSccCompilerAdapter preprocessor only supports quoted or angle #include in ${resolved}.`);
                const name = include[1] ?? include[2];
                const includeFile = resolveInclude(name, include[2] !== undefined, resolved, [...(opts.includeDirs ?? []), ...(opts.bundledIncludeDirs ?? [])]);
                if (!includeFile)
                    throw new Error(`TsSccCompilerAdapter preprocessor cannot resolve include '${name}' from ${resolved}.`);
                if (node_path_1.default.basename(includeFile) === "stdio.h" && [...bundledDirs].some((dir) => includeFile.startsWith(`${dir}${node_path_1.default.sep}`)) && macros.has("MZ80_RUNTIME_FULL")) {
                    runtimeVariadicNames.add("printf");
                    runtimeVariadicNames.add("sprintf");
                }
                output.push(process(node_fs_1.default.readFileSync(includeFile, "utf8"), includeFile));
                continue;
            }
            if (command === "define") {
                const match = /^([A-Za-z_]\w*)(?:\s+(.*))?$/.exec(rest);
                if (!match || rest.startsWith(`${match?.[1]}(`))
                    throw new Error(`TsSccCompilerAdapter preprocessor supports object-like #define only in ${resolved}.`);
                const [, name, value = "1"] = match;
                if (opts.defines?.[name] !== undefined && opts.defines[name] !== value)
                    throw new Error(`TsSccCompilerAdapter preprocessor cannot override configured define ${name}.`);
                macros.set(name, value);
                output.push("");
                continue;
            }
            if (command === "undef") {
                if (!/^[A-Za-z_]\w*$/.test(rest))
                    throw new Error(`TsSccCompilerAdapter preprocessor invalid #undef in ${resolved}.`);
                if (opts.defines?.[rest] !== undefined)
                    throw new Error(`TsSccCompilerAdapter preprocessor cannot undef configured define ${rest}.`);
                macros.delete(rest);
                output.push("");
                continue;
            }
            throw new Error(`TsSccCompilerAdapter preprocessor does not support #${command} in ${resolved}.`);
        }
        stack.pop();
        if (conditions.length)
            throw new Error(`TsSccCompilerAdapter preprocessor missing #endif in ${resolved}.`);
        return output.join("\n");
    };
    return { sourceText: process(input, file), runtimeVariadicNames };
}
function resolveInclude(name, angle, from, dirs) {
    const candidates = [...(angle ? [] : [node_path_1.default.join(node_path_1.default.dirname(from), name)]), ...dirs.map((dir) => node_path_1.default.join(node_path_1.default.resolve(dir), name))];
    return candidates.find((entry) => node_fs_1.default.existsSync(entry) && node_fs_1.default.statSync(entry).isFile());
}
function evaluateIf(expression, macros) {
    const match = /^defined\s*(?:\(\s*([A-Za-z_]\w*)\s*\)|\s+([A-Za-z_]\w*))$/.exec(expression);
    if (match)
        return macros.has(match[1] ?? match[2]);
    if (/^[A-Za-z_]\w*$/.test(expression))
        return macros.has(expression) && macros.get(expression) !== "0";
    if (/^(?:0|1)$/.test(expression))
        return expression === "1";
    throw new Error(`TsSccCompilerAdapter preprocessor only supports #if defined(NAME), #if NAME, and #if 0/1; got '${expression}'.`);
}
function expandMacros(line, macros) {
    let result = line;
    for (const [name, value] of macros)
        result = result.replace(new RegExp(`\\b${name}\\b`, "g"), value);
    return result;
}

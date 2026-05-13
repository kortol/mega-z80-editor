import * as fs from "node:fs";
import * as path from "node:path";
import { Mz80AsOptions, Mz80CleanOptions, Mz80LinkOptions, Mz80ProjectFile, Mz80TargetConfig } from "./projectConfig";

type ParsedMakeRule = {
  target: string;
  commands: string[];
};

type ParsedAssembly = {
  input: string;
  output: string;
  options: Mz80AsOptions;
};

type ParsedLink = {
  output: string;
  inputs: string[];
  options: Mz80LinkOptions;
};

type ParsedMonolithicBuild = {
  output: string;
  sources: string[];
  asOptions: Mz80AsOptions;
  linkOptions: Mz80LinkOptions;
};

type ImportResult = {
  config: Mz80ProjectFile;
  makefilePath: string;
};

const MAKEFILE_NAMES = ["Makefile", "makefile", "GNUmakefile"];

export function importProjectFromSimpleMakefile(workspaceRoot: string, baseConfig?: Mz80ProjectFile): ImportResult {
  const makefilePath = findMakefilePath(workspaceRoot);
  if (!makefilePath) {
    throw new Error("No Makefile found in the workspace root.");
  }
  const content = fs.readFileSync(makefilePath, "utf8");
  const unsupportedReason = detectUnsupportedMakefile(workspaceRoot, content);
  if (unsupportedReason) {
    throw new Error(unsupportedReason);
  }

  const variables = parseVariables(content);
  const rules = parseRules(content, variables);
  const assemblies = new Map<string, ParsedAssembly>();
  const targets: Record<string, Mz80TargetConfig> = {};

  for (const rule of rules) {
    for (const commandLine of rule.commands) {
      const tokens = tokenizeShell(commandLine);
      const parsed = parseMz80Command(tokens);
      if (!parsed) continue;
      if (parsed.kind === "as") {
        assemblies.set(normalizePathKey(parsed.output), parsed);
        continue;
      }
      const modules = parsed.inputs.map((input) => {
        const asm = assemblies.get(normalizePathKey(input));
        if (!asm) {
          throw new Error(`Link input '${input}' is not backed by a simple 'mz80 as' command.`);
        }
        return {
          source: asm.input,
          object: asm.output,
        };
      });
      const asOptions = foldAssemblyOptions(modules.map((m) => assemblies.get(normalizePathKey(m.object))!).map((m) => m.options));
      const targetName = sanitizeTargetName(path.basename(rule.target, path.extname(rule.target)) || path.basename(parsed.output, path.extname(parsed.output)));
      targets[targetName] = {
        output: toPosixPath(path.relative(workspaceRoot, path.resolve(workspaceRoot, parsed.output))),
        modules: modules.map((m) => ({
          source: toPosixPath(path.relative(workspaceRoot, path.resolve(workspaceRoot, m.source))),
          object: toPosixPath(path.relative(workspaceRoot, path.resolve(workspaceRoot, m.object))),
        })),
        as: asOptions,
        link: parsed.options,
        debug: parsed.options.com ? { cpm: true, cpmInteractive: true } : undefined,
      };
    }
  }

  for (const rule of rules) {
    if (targets[sanitizeTargetName(path.basename(rule.target, path.extname(rule.target)))]) continue;
    for (const commandLine of rule.commands) {
      const tokens = tokenizeShell(commandLine);
      const parsed = parseSimpleZ80asmCommand(tokens);
      if (!parsed) continue;
      const targetName = sanitizeTargetName(path.basename(rule.target, path.extname(rule.target)) || path.basename(parsed.output, path.extname(parsed.output)));
      targets[targetName] = {
        output: toPosixPath(path.relative(workspaceRoot, path.resolve(workspaceRoot, parsed.output))),
        modules: parsed.sources.map((source) => ({
          source: toPosixPath(path.relative(workspaceRoot, path.resolve(workspaceRoot, source))),
          object: toPosixPath(path.relative(workspaceRoot, path.resolve(workspaceRoot, deriveObjectPath(parsed.output, source)))),
        })),
        as: parsed.asOptions,
        link: parsed.linkOptions,
        debug: parsed.linkOptions.com ? { cpm: true, cpmInteractive: true } : undefined,
      };
    }
  }

  if (Object.keys(targets).length === 0) {
    throw new Error("No simple mz80 assemble/link pipeline was found in the Makefile.");
  }

  const defaultTarget = Object.keys(targets)[0];
  const merged: Mz80ProjectFile = {
    ...(baseConfig ?? {}),
    version: 1,
    project: {
      ...(baseConfig?.project ?? {}),
      defaultTarget,
      clean: detectCleanRule(rules) ?? baseConfig?.project?.clean,
    },
    targets,
  };
  return { config: merged, makefilePath };
}

function findMakefilePath(workspaceRoot: string): string | undefined {
  for (const name of MAKEFILE_NAMES) {
    const candidate = path.join(workspaceRoot, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function detectUnsupportedMakefile(workspaceRoot: string, content: string): string | undefined {
  const unsupportedFiles = ["configure.ac", "configure.in", "Makefile.am", "Makefile.in"];
  for (const file of unsupportedFiles) {
    if (fs.existsSync(path.join(workspaceRoot, file))) {
      return "This workspace appears to use a generated or framework-managed Makefile. Create mz80.yaml manually.";
    }
  }
  if (/@[A-Za-z0-9_]+@/.test(content) || /\bAC_[A-Z0-9_]+\b/.test(content) || /\bAM_[A-Z0-9_]+\b/.test(content)) {
    return "This Makefile looks generated by autoconf/automake. Create mz80.yaml manually.";
  }
  if (/^\s*include\s+/m.test(content)) {
    return "Makefile include chains are not supported by the simple importer. Create mz80.yaml manually.";
  }
  return undefined;
}

function parseVariables(content: string): Map<string, string> {
  const vars = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(\+?[:?]?=)\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, name, op, rawValue] = m;
    const value = rawValue.trim();
    if (op === "+=") {
      vars.set(name, `${vars.get(name) ?? ""} ${value}`.trim());
    } else {
      vars.set(name, value);
    }
  }
  return vars;
}

function parseRules(content: string, vars: Map<string, string>): ParsedMakeRule[] {
  const lines = content.split(/\r?\n/);
  const rules: ParsedMakeRule[] = [];
  let current: ParsedMakeRule | undefined;
  for (const line of lines) {
    const ruleMatch = /^([^\s:#][^:]*)\s*:\s*(.*)$/.exec(line);
    if (ruleMatch && !/=/.test(ruleMatch[1])) {
      current = {
        target: expandVariables(ruleMatch[1].trim(), vars),
        commands: [],
      };
      rules.push(current);
      continue;
    }
    if (current && (/^\t/.test(line) || /^ {2,}\S/.test(line))) {
      current.commands.push(expandVariables(line.trim(), vars));
      continue;
    }
    if (line.trim().length === 0) continue;
    current = undefined;
  }
  return rules;
}

function expandVariables(input: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 8) return input;
  return input.replace(/\$\(([^)]+)\)|\$\{([^}]+)\}/g, (_, a, b) => {
    const key = (a ?? b ?? "").trim();
    const value = vars.get(key) ?? "";
    return expandVariables(value, vars, depth + 1);
  });
}

function tokenizeShell(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | "\"" | "" = "";
  let escape = false;
  for (const ch of command) {
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = "";
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === "'" || ch === "\"") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function parseMz80Command(tokens: string[]): (ParsedAssembly & { kind: "as" }) | (ParsedLink & { kind: "link" }) | undefined {
  const info = findMz80Invocation(tokens);
  if (!info) return undefined;
  const args = tokens.slice(info.argsIndex);
  if (info.subcommand === "as") return parseAssemblerCommand(args);
  if (info.subcommand === "link") return parseLinkCommand(args);
  return undefined;
}

function parseSimpleZ80asmCommand(tokens: string[]): ParsedMonolithicBuild | undefined {
  if (tokens.length === 0) return undefined;
  const base = path.basename(tokens[0]).toLowerCase();
  if (base !== "z88dk-z80asm" && base !== "z80asm" && base !== "z80asm.exe" && base !== "z88dk-z80asm.exe") {
    return undefined;
  }

  const asOptions: Mz80AsOptions = {};
  const linkOptions: Mz80LinkOptions = {
    com: true,
    map: true,
    sym: true,
    smap: true,
    log: true,
  };
  const sources: string[] = [];
  let output: string | undefined;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^-o[^=].+/i.test(token)) {
      output = token.slice(2);
      continue;
    }
    if (/^-o=.+/i.test(token)) {
      output = token.slice(3);
      continue;
    }
    if ((token === "-o" || token === "--output") && tokens[i + 1]) {
      output = tokens[++i];
      continue;
    }
    if (token === "-b") {
      continue;
    }
    if (token === "-d") {
      asOptions.sym = true;
      continue;
    }
    if (token === "-l") {
      asOptions.lst = true;
      continue;
    }
    if (token === "-m") {
      linkOptions.map = true;
      continue;
    }
    if (/^-I.+/.test(token)) {
      asOptions.includePaths ??= [];
      asOptions.includePaths.push(token.slice(2));
      continue;
    }
    if ((token === "-I" || token === "--include") && tokens[i + 1]) {
      asOptions.includePaths ??= [];
      asOptions.includePaths.push(tokens[++i]);
      continue;
    }
    if (token.startsWith("-")) {
      throw new Error(`Unsupported z80asm flag in Makefile import: ${token}`);
    }
    if (/\.asm$/i.test(token)) {
      sources.push(token);
      continue;
    }
  }

  if (!output || sources.length === 0) {
    throw new Error("Simple Makefile importer expected 'z88dk-z80asm -o<output> <sources...>'.");
  }

  if (/\.com$/i.test(output)) {
    linkOptions.com = true;
  }

  asOptions.smap = true;
  return { output, sources, asOptions, linkOptions };
}

function findMz80Invocation(tokens: string[]): { subcommand: "as" | "link"; argsIndex: number } | undefined {
  for (let i = 0; i < tokens.length; i++) {
    const base = path.basename(tokens[i]).toLowerCase();
    if (base !== "mz80" && base !== "mz80.cmd" && base !== "index.js") continue;
    let next = i + 1;
    if (tokens[next] === "--") next++;
    const sub = tokens[next]?.toLowerCase();
    if (sub === "as" || sub === "link") {
      return { subcommand: sub, argsIndex: next + 1 };
    }
  }
  return undefined;
}

function parseAssemblerCommand(args: string[]): ParsedAssembly & { kind: "as" } {
  const options: Mz80AsOptions = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    switch (token) {
      case "--sym":
        options.sym = true;
        break;
      case "--lst":
        options.lst = true;
        break;
      case "--smap":
        options.smap = true;
        break;
      case "--sjasm-compat":
        options.sjasmCompat = true;
        break;
      case "--rel-version":
        options.relVersion = args[++i];
        break;
      case "--symlen":
        options.symLen = args[++i];
        break;
      case "-I":
      case "--include":
      case "--inc":
        options.includePaths ??= [];
        if (args[i + 1]) options.includePaths.push(args[++i]);
        break;
      default:
        if (token.startsWith("-")) {
          throw new Error(`Unsupported assembler flag in Makefile import: ${token}`);
        }
        positional.push(token);
        break;
    }
  }
  if (positional.length < 2) {
    throw new Error("Simple Makefile importer expected 'mz80 as <input> <output>'.");
  }
  return {
    kind: "as",
    input: positional[0],
    output: positional[1],
    options,
  };
}

function parseLinkCommand(args: string[]): ParsedLink & { kind: "link" } {
  const options: Mz80LinkOptions = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    switch (token) {
      case "--map":
        options.map = true;
        break;
      case "--sym":
        options.sym = true;
        break;
      case "--smap":
        options.smap = true;
        break;
      case "--log":
        options.log = true;
        break;
      case "--com":
        options.com = true;
        break;
      case "--bin-from":
        options.binFrom = args[++i];
        break;
      case "--bin-to":
        options.binTo = args[++i];
        break;
      case "--org-text":
        options.orgText = args[++i];
        break;
      case "--org-data":
        options.orgData = args[++i];
        break;
      case "--org-bss":
        options.orgBss = args[++i];
        break;
      case "--org-custom":
        options.orgCustom = args[++i];
        break;
      case "--fullpath":
        options.fullpath = (args[i + 1] && !args[i + 1].startsWith("-") ? args[++i] : "rel") as "off" | "rel" | "on";
        break;
      default:
        if (token.startsWith("-")) {
          throw new Error(`Unsupported linker flag in Makefile import: ${token}`);
        }
        positional.push(token);
        break;
    }
  }
  if (positional.length < 2) {
    throw new Error("Simple Makefile importer expected 'mz80 link <output> <inputs...>'.");
  }
  return {
    kind: "link",
    output: positional[0],
    inputs: positional.slice(1),
    options,
  };
}

function foldAssemblyOptions(options: Mz80AsOptions[]): Mz80AsOptions | undefined {
  if (options.length === 0) return undefined;
  const baseline = JSON.stringify(normalizeAsOptions(options[0]));
  for (const option of options.slice(1)) {
    if (JSON.stringify(normalizeAsOptions(option)) !== baseline) {
      throw new Error("Modules in the imported Makefile use different assembler flags. Create mz80.yaml manually.");
    }
  }
  return normalizeAsOptions(options[0]);
}

function normalizeAsOptions(options: Mz80AsOptions): Mz80AsOptions {
  return {
    ...(options.relVersion !== undefined ? { relVersion: options.relVersion } : {}),
    ...(options.sym ? { sym: true } : {}),
    ...(options.lst ? { lst: true } : {}),
    ...(options.smap ? { smap: true } : {}),
    ...(options.sjasmCompat ? { sjasmCompat: true } : {}),
    ...(options.symLen !== undefined ? { symLen: options.symLen } : {}),
    ...(options.includePaths?.length ? { includePaths: options.includePaths.map(toPosixPath) } : {}),
  };
}

function sanitizeTargetName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "default";
}

function deriveObjectPath(targetOutput: string, sourcePath: string): string {
  const outDir = path.dirname(targetOutput);
  const base = path.basename(sourcePath).replace(/\.[^.]+$/, ".rel");
  return path.join(outDir, base);
}

function detectCleanRule(rules: ParsedMakeRule[]): Mz80CleanOptions | undefined {
  const cleanRule = rules.find((rule) => rule.target === "clean");
  if (!cleanRule) return undefined;

  const files = new Set<string>();
  for (const command of cleanRule.commands) {
    const tokens = tokenizeShell(command);
    if (tokens.length === 0) continue;
    const cmd = path.basename(tokens[0]).toLowerCase();
    if (cmd === "rm") {
      for (const token of tokens.slice(1)) {
        if (token.startsWith("-")) continue;
        if (isSafeCleanPattern(token)) files.add(token);
      }
      continue;
    }
    if (cmd === "del") {
      for (const token of tokens.slice(1)) {
        if (token.startsWith("/")) continue;
        if (isSafeCleanPattern(token)) files.add(token);
      }
    }
  }

  return files.size > 0 ? { files: [...files] } : undefined;
}

function normalizePathKey(filePath: string): string {
  return path.normalize(filePath).toLowerCase();
}

function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function isSafeCleanPattern(pattern: string): boolean {
  const normalized = String(pattern ?? "").trim().replace(/\\/g, "/");
  if (!normalized) return false;
  if (path.isAbsolute(normalized)) return false;
  if (normalized.includes("..")) return false;
  if (normalized.includes("**")) return false;

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  if (segments.some((segment) => /^[*?]+$/.test(segment))) return false;

  const basename = segments[segments.length - 1];
  if (/^[*?]+$/.test(basename)) return false;
  if (!/[*?]/.test(basename)) return true;

  return /[A-Za-z0-9_.-]/.test(basename.replace(/[*?]/g, ""));
}

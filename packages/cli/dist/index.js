#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const yaml_1 = __importDefault(require("yaml"));
const logger_1 = require("./logger");
function loadConfigFile(configPath, logger) {
    try {
        if (!fs_1.default.existsSync(configPath))
            return {};
        const content = fs_1.default.readFileSync(configPath, "utf-8");
        return (yaml_1.default.parse(content) ?? {});
    }
    catch (err) {
        logger?.warn?.(`Failed to load config: ${err?.message ?? err}`);
        return {};
    }
}
function shouldUseConfig(valueSource) {
    return valueSource !== "cli";
}
function validateConfig(cfg) {
    const errors = [];
    const as = cfg.as;
    const link = cfg.link;
    if (as) {
        if (as.relVersion !== undefined) {
            const v = String(as.relVersion);
            if (v !== "1" && v !== "2")
                errors.push(`as.relVersion must be 1 or 2 (got ${as.relVersion})`);
        }
        if (as.symLen !== undefined) {
            const n = Number(as.symLen);
            if (!Number.isFinite(n) || n <= 0)
                errors.push(`as.symLen must be positive number (got ${as.symLen})`);
        }
        if (as.includePaths !== undefined && !Array.isArray(as.includePaths)) {
            errors.push(`as.includePaths must be an array of strings`);
        }
    }
    if (link) {
        if (link.fullpath !== undefined) {
            const v = String(link.fullpath).toLowerCase();
            if (v !== "off" && v !== "rel" && v !== "on") {
                errors.push(`link.fullpath must be off | rel | on (got ${link.fullpath})`);
            }
        }
        const checkAddr = (key, value) => {
            if (value === undefined)
                return;
            const t = String(value).trim();
            if (!/^(0x[0-9a-fA-F]+|[0-9a-fA-F]+H|\d+)$/.test(t)) {
                errors.push(`link.${key} must be a number or hex (got ${value})`);
            }
        };
        checkAddr("binFrom", link.binFrom);
        checkAddr("binTo", link.binTo);
        checkAddr("orgText", link.orgText);
        checkAddr("orgData", link.orgData);
        checkAddr("orgBss", link.orgBss);
        checkAddr("orgCustom", link.orgCustom);
    }
    return { valid: errors.length === 0, errors };
}
// P1 assembler / linker を import
const mz80_as_1 = require("./cli/mz80-as");
const mz80_link_1 = require("./cli/mz80-link");
const mz80_dbg_1 = require("./cli/mz80-dbg");
const console_1 = require("./console");
const program = new commander_1.Command();
program.enablePositionalOptions();
function normalizeArgvForFullpath(argv) {
    const out = [...argv];
    for (let i = 0; i < out.length; i++) {
        if (out[i] !== "--fullpath")
            continue;
        const next = out[i + 1];
        if (!next || next.startsWith("-")) {
            out[i] = "--fullpath=rel";
            continue;
        }
        const low = String(next).toLowerCase();
        if (low === "off" || low === "rel" || low === "on")
            continue;
        out[i] = "--fullpath=rel";
    }
    return out;
}
program
    .name("mz80")
    .description("MegaZ80Editor CLI (P0 phase)")
    .version("0.0.0")
    .option("--config <file>", "config file (default: mz80.yaml)", "mz80.yaml")
    .option("--json", "output JSON instead of human-readable text", false)
    .option("--verbose", "enable verbose logging", false)
    .option("--quiet", "suppress all output", false);
program
    .command("check-config")
    .description("Check and print the mz80.yaml configuration")
    .action(() => {
    const opts = program.opts();
    const logLevel = opts.quiet
        ? "quiet"
        : opts.verbose
            ? "verbose"
            : "normal";
    const logger = (0, logger_1.createLogger)(logLevel);
    const configPath = path_1.default.resolve(process.cwd(), opts.config);
    logger.debug(`Using config path: ${configPath}`);
    if (!fs_1.default.existsSync(configPath)) {
        const msg = `Config file not found: ${configPath}`;
        if (opts.json) {
            console.error(JSON.stringify({ error: msg }));
        }
        else {
            logger.error(msg);
        }
        process.exit(1);
    }
    const content = fs_1.default.readFileSync(configPath, "utf-8");
    const parsed = yaml_1.default.parse(content);
    const { valid, errors } = validateConfig(parsed ?? {});
    if (!valid) {
        const msg = `Config validation failed:\n${errors.map(e => `- ${e}`).join("\n")}`;
        if (opts.json) {
            console.error(JSON.stringify({ error: "config validation failed", details: errors }, null, 2));
        }
        else {
            logger.error(msg);
        }
        process.exit(1);
    }
    if (opts.json) {
        console.log(JSON.stringify(parsed, null, 2));
    }
    else {
        logger.info("✅ Config loaded:");
        console.log(parsed);
    }
});
// === サブコマンド: as (アセンブラ) ===
program
    .command("as <input> <output>")
    .description("Assemble .asm into .rel")
    .option("--rel-version <version>", "Specify the .rel version (1 or 2)", "2")
    .option("--sym", "Generate .sym file")
    .option("--lst", "Generate .lst file")
    .option("--symlen <n>", "Default symbol length (.SYMLEN)", "32")
    .option("-I, --include <path...>", "Add include search path(s)")
    .option("--inc <path...>", "Add include search path(s) (alias)")
    .option("--verbose", "Show detailed output")
    .option("--quiet", "Suppress logs")
    .action((input, output, opts, command) => {
    const logLevel = opts.quiet
        ? "quiet"
        : opts.verbose
            ? "verbose"
            : "normal";
    const logger = (0, logger_1.createLogger)(logLevel);
    const globalOpts = program.opts();
    const configPath = path_1.default.resolve(process.cwd(), globalOpts.config ?? "mz80.yaml");
    const cfg = loadConfigFile(configPath, logger);
    if (cfg.as) {
        if (shouldUseConfig(command.getOptionValueSource("relVersion")))
            opts.relVersion = cfg.as.relVersion ?? opts.relVersion;
        if (shouldUseConfig(command.getOptionValueSource("sym")))
            opts.sym = cfg.as.sym ?? opts.sym;
        if (shouldUseConfig(command.getOptionValueSource("lst")))
            opts.lst = cfg.as.lst ?? opts.lst;
        if (shouldUseConfig(command.getOptionValueSource("symlen")))
            opts.symlen = cfg.as.symLen ?? opts.symlen;
    }
    const relVersion = String(opts.relVersion ?? "2") === "2" ? 2 : 1;
    const includeCli = [
        ...(opts.include ?? []),
        ...(opts.inc ?? []),
    ];
    const includePaths = includeCli.length > 0
        ? includeCli
        : (cfg.as?.includePaths ?? []);
    const symLen = Number(opts.symlen ?? "32");
    const out = new console_1.Console(opts.verbose);
    try {
        (0, mz80_as_1.assemble)(logger, input, output, {
            verbose: !!opts.verbose,
            relVersion,
            sym: !!opts.sym,
            lst: !!opts.lst,
            symLen: Number.isFinite(symLen) ? symLen : undefined,
            includePaths,
        });
        out.success(`Assembled: ${input} → ${output}`);
    }
    catch (err) {
        out.error(`Assembly failed: ${err.message}`);
        process.exit(1);
    }
});
// === サブコマンド: link (リンカ) ===
program
    .command("link <output> <inputs...>")
    .description("Link .rel files into .bin / .map / .sym / .log")
    .option("--map", "Generate .map file")
    .option("--sym", "Generate .sym file")
    .option("--log", "Generate .log file")
    .option("--com", "CP/M COM output (drop bytes before 0100H)")
    .option("--bin-from <addr>", "Start address for binary output")
    .option("--bin-to <addr>", "End address for binary output (inclusive)")
    .option("--org-text <addr>", "Link base for TEXT/CSEG")
    .option("--org-data <addr>", "Link base for DATA/DSEG")
    .option("--org-bss <addr>", "Link base for BSS")
    .option("--org-custom <addr>", "Link base for CUSTOM")
    .option("--fullpath [mode]", "Map source path mode: off | rel | on (without value: rel)")
    .option("--verbose", "Show detailed output")
    .option("--quiet", "Suppress logs")
    .action((output, inputs, opts, command) => {
    try {
        const globalOpts = program.opts();
        const configPath = path_1.default.resolve(process.cwd(), globalOpts.config ?? "mz80.yaml");
        const logger = (0, logger_1.createLogger)(opts.quiet ? "quiet" : opts.verbose ? "verbose" : "normal");
        const cfg = loadConfigFile(configPath, logger);
        if (cfg.link) {
            if (shouldUseConfig(command.getOptionValueSource("map")))
                opts.map = cfg.link.map ?? opts.map;
            if (shouldUseConfig(command.getOptionValueSource("sym")))
                opts.sym = cfg.link.sym ?? opts.sym;
            if (shouldUseConfig(command.getOptionValueSource("log")))
                opts.log = cfg.link.log ?? opts.log;
            if (shouldUseConfig(command.getOptionValueSource("com")))
                opts.com = cfg.link.com ?? opts.com;
            if (shouldUseConfig(command.getOptionValueSource("binFrom")))
                opts.binFrom = cfg.link.binFrom ?? opts.binFrom;
            if (shouldUseConfig(command.getOptionValueSource("binTo")))
                opts.binTo = cfg.link.binTo ?? opts.binTo;
            if (shouldUseConfig(command.getOptionValueSource("orgText")))
                opts.orgText = cfg.link.orgText ?? opts.orgText;
            if (shouldUseConfig(command.getOptionValueSource("orgData")))
                opts.orgData = cfg.link.orgData ?? opts.orgData;
            if (shouldUseConfig(command.getOptionValueSource("orgBss")))
                opts.orgBss = cfg.link.orgBss ?? opts.orgBss;
            if (shouldUseConfig(command.getOptionValueSource("orgCustom")))
                opts.orgCustom = cfg.link.orgCustom ?? opts.orgCustom;
            if (shouldUseConfig(command.getOptionValueSource("fullpath")))
                opts.fullpath = cfg.link.fullpath ?? opts.fullpath;
        }
        (0, mz80_link_1.link)(inputs, output, opts);
    }
    catch (err) {
        console.error(`❌ Link failed: ${err.message}`);
        process.exit(1);
    }
});
// === サブコマンド: dbg ===
program
    .command("dbg <input>")
    .description("Debug binary image (.com/.bin): hexdump + lightweight decode")
    .option("--sym <file>", "symbol file for annotation (.sym)")
    .option("--base <addr>", "base address (default: 0100H for .com, 0000H otherwise)")
    .option("--from <addr>", "start address for dump/decode")
    .option("--bytes <n>", "number of bytes for hexdump", "128")
    .option("--decode <n>", "number of decoded instructions", "24")
    .option("--cmd <script>", "command script (e.g. \"break add 0100h; run 1000; regs\")")
    .option("--cpm", "run minimal CP/M execution from entry with BDOS hook")
    .option("--cpm-interactive", "enable interactive console input for CP/M BDOS")
    .option("--cpm-root <path>", "host directory for CP/M file I/O (default: cwd)")
    .option("--entry <addr>", "entry address for --cpm (default: 0100H)")
    .option("--steps <n>", "max instruction steps for --cpm", "200000")
    .option("--progress-every <n>", "print progress every N steps during --cpm run")
    .option("--save-state <file>", "save debugger state snapshot to file when run stops")
    .option("--load-state <file>", "load debugger state snapshot file and resume from it")
    .option("--save-state-every <n>", "save checkpoint state every N steps during --cpm run")
    .option("--trace", "trace CPU state each step for --cpm")
    .option("--bdos-trace", "trace BDOS function calls for --cpm")
    .option("--tail <text>", "CP/M command tail text (written to 0080H)")
    .action((input, opts) => {
    try {
        (0, mz80_dbg_1.dbgBinary)(input, opts);
    }
    catch (err) {
        console.error(`❌ Debug failed: ${err.message}`);
        process.exit(1);
    }
});
// === サブコマンド: build ===
program
    .command("build")
    .description("Build the project (stub in P0 phase)")
    .action(() => {
    const opts = program.opts();
    const logLevel = opts.quiet
        ? "quiet"
        : opts.verbose
            ? "verbose"
            : "normal";
    const logger = (0, logger_1.createLogger)(logLevel);
    logger.info("🔨 [build] Stub: build process not implemented yet.");
    if (opts.json) {
        console.log(JSON.stringify({ status: "ok", message: "build stub" }));
    }
});
// === サブコマンド: run ===
program
    .command("run")
    .description("Run the project (stub in P0 phase)")
    .action(() => {
    const opts = program.opts();
    const logLevel = opts.quiet
        ? "quiet"
        : opts.verbose
            ? "verbose"
            : "normal";
    const logger = (0, logger_1.createLogger)(logLevel);
    logger.info("▶️ [run] Stub: run process not implemented yet.");
    if (opts.json) {
        console.log(JSON.stringify({ status: "ok", message: "run stub" }));
    }
});
program.parse(normalizeArgvForFullpath(process.argv));

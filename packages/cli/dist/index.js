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
// P1 assembler / linker を import
const mz80_as_1 = require("./cli/mz80-as");
const mz80_link_1 = require("./cli/mz80-link");
const console_1 = require("./console");
const program = new commander_1.Command();
program.enablePositionalOptions();
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
    .option("--parser <mode>", "Select parser (legacy|peg)", "peg")
    .option("--verbose", "Show detailed output")
    .option("--quiet", "Suppress logs")
    .action((input, output, opts) => {
    const logLevel = opts.quiet
        ? "quiet"
        : opts.verbose
            ? "verbose"
            : "normal";
    const logger = (0, logger_1.createLogger)(logLevel);
    const relVersion = opts.relVersion === "2" ? 2 : 1;
    const parserMode = opts.parser === "peg" ? "peg" : "legacy";
    const out = new console_1.Console(opts.verbose);
    try {
        (0, mz80_as_1.assemble)(logger, input, output, { verbose: !!opts.verbose, relVersion, parser: parserMode });
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
    .option("--verbose", "Show detailed output")
    .option("--quiet", "Suppress logs")
    .action((output, inputs, opts) => {
    try {
        (0, mz80_link_1.link)(inputs, output, opts);
    }
    catch (err) {
        console.error(`❌ Link failed: ${err.message}`);
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
program.parse(process.argv);

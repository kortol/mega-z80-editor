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
const logger_js_1 = require("./logger.js");
const program = new commander_1.Command();
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
    const logLevel = opts.quiet ? "quiet" : opts.verbose ? "verbose" : "normal";
    const logger = new logger_js_1.Logger(logLevel);
    const configPath = path_1.default.resolve(process.cwd(), opts.config);
    logger.verbose(`Using config path: ${configPath}`);
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
// === サブコマンド: build ===
program
    .command("build")
    .description("Build the project (stub in P0 phase)")
    .action(() => {
    const opts = program.opts();
    const logLevel = opts.quiet ? "quiet" : opts.verbose ? "verbose" : "normal";
    const logger = new logger_js_1.Logger(logLevel);
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
    const logLevel = opts.quiet ? "quiet" : opts.verbose ? "verbose" : "normal";
    const logger = new logger_js_1.Logger(logLevel);
    logger.info("▶️ [run] Stub: run process not implemented yet.");
    if (opts.json) {
        console.log(JSON.stringify({ status: "ok", message: "run stub" }));
    }
});
program.parse(process.argv);

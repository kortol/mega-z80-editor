#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import yaml from "yaml";
import { Logger } from "./logger";

// P1 assembler / linker を import
import { assemble } from "./cli/mz80-as";
import { link } from "./cli/mz80-link";

const program = new Command();

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
    const logLevel: "quiet" | "normal" | "verbose" =
      opts.quiet ? "quiet" : opts.verbose ? "verbose" : "normal";
    const logger = new Logger(logLevel);

    const configPath = path.resolve(process.cwd(), opts.config);
    logger.verbose(`Using config path: ${configPath}`);

    if (!fs.existsSync(configPath)) {
      const msg = `Config file not found: ${configPath}`;
      if (opts.json) {
        console.error(JSON.stringify({ error: msg }));
      } else {
        logger.error(msg);
      }
      process.exit(1);
    }

    const content = fs.readFileSync(configPath, "utf-8");
    const parsed = yaml.parse(content);

    if (opts.json) {
      console.log(JSON.stringify(parsed, null, 2));
    } else {
      logger.info("✅ Config loaded:");
      console.log(parsed);
    }
  });

// === サブコマンド: as (アセンブラ) ===
program
  .command("as <input> <output>")
  .description("Assemble .asm into .rel")
  .action((input, output) => {
    const opts = program.opts();
    const logLevel: "quiet" | "normal" | "verbose" =
      opts.quiet ? "quiet" : opts.verbose ? "verbose" : "normal";
    const logger = new Logger(logLevel);

    try {
      assemble(input, output);
      logger.info(`✅ Assembled: ${input} → ${output}`);
    } catch (err: any) {
      logger.error(`❌ Assembly failed: ${err.message}`);
      process.exit(1);
    }
  });

// === サブコマンド: link (リンカ) ===
program
  .command("link <output> <inputs...>")
  .description("Link .rel files into .bin")
  .action((output, inputs: string[]) => {
    const opts = program.opts();
    const logLevel: "quiet" | "normal" | "verbose" =
      opts.quiet ? "quiet" : opts.verbose ? "verbose" : "normal";
    const logger = new Logger(logLevel);

    try {
      link(inputs, output);
      logger.info(`✅ Linked: ${inputs.join(", ")} → ${output}`);
    } catch (err: any) {
      logger.error(`❌ Link failed: ${err.message}`);
      process.exit(1);
    }
  });  

// === サブコマンド: build ===
program
  .command("build")
  .description("Build the project (stub in P0 phase)")
  .action(() => {
    const opts = program.opts();
    const logLevel: "quiet" | "normal" | "verbose" =
      opts.quiet ? "quiet" : opts.verbose ? "verbose" : "normal";
    const logger = new Logger(logLevel);

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
    const logLevel: "quiet" | "normal" | "verbose" =
      opts.quiet ? "quiet" : opts.verbose ? "verbose" : "normal";
    const logger = new Logger(logLevel);

    logger.info("▶️ [run] Stub: run process not implemented yet.");
    if (opts.json) {
      console.log(JSON.stringify({ status: "ok", message: "run stub" }));
    }
  });

program.parse(process.argv);

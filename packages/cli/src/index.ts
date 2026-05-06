#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import yaml from "yaml";
import { createLogger } from "./logger";

type Mz80Config = {
  as?: {
    relVersion?: number | string;
    sym?: boolean;
    lst?: boolean;
    smap?: boolean;
    symLen?: number | string;
    includePaths?: string[];
    sjasmCompat?: boolean;
  };
  link?: {
    com?: boolean;
    map?: boolean;
    sym?: boolean;
    smap?: boolean;
    log?: boolean;
    fullpath?: "off" | "rel" | "on";
    binFrom?: string | number;
    binTo?: string | number;
    orgText?: string | number;
    orgData?: string | number;
    orgBss?: string | number;
    orgCustom?: string | number;
  };
};

function loadConfigFile(configPath: string, logger?: ReturnType<typeof createLogger>): Mz80Config {
  try {
    if (!fs.existsSync(configPath)) return {};
    const content = fs.readFileSync(configPath, "utf-8");
    return (yaml.parse(content) ?? {}) as Mz80Config;
  } catch (err: any) {
    logger?.warn?.(`Failed to load config: ${err?.message ?? err}`);
    return {};
  }
}

function shouldUseConfig(
  valueSource: string | undefined
): boolean {
  return valueSource !== "cli";
}

function validateConfig(cfg: Mz80Config): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const as = cfg.as;
  const link = cfg.link;

  if (as) {
    if (as.relVersion !== undefined) {
      const v = String(as.relVersion);
      if (v !== "1" && v !== "2") errors.push(`as.relVersion must be 1 or 2 (got ${as.relVersion})`);
    }
    if (as.symLen !== undefined) {
      const n = Number(as.symLen);
      if (!Number.isFinite(n) || n <= 0) errors.push(`as.symLen must be positive number (got ${as.symLen})`);
    }
    if (as.includePaths !== undefined && !Array.isArray(as.includePaths)) {
      errors.push(`as.includePaths must be an array of strings`);
    }
    if (as.sjasmCompat !== undefined && typeof as.sjasmCompat !== "boolean") {
      errors.push(`as.sjasmCompat must be boolean (got ${as.sjasmCompat})`);
    }
    if (as.smap !== undefined && typeof as.smap !== "boolean") {
      errors.push(`as.smap must be boolean (got ${as.smap})`);
    }
  }

  if (link) {
    if (link.fullpath !== undefined) {
      const v = String(link.fullpath).toLowerCase();
      if (v !== "off" && v !== "rel" && v !== "on") {
        errors.push(`link.fullpath must be off | rel | on (got ${link.fullpath})`);
      }
    }
    if (link.smap !== undefined && typeof link.smap !== "boolean") {
      errors.push(`link.smap must be boolean (got ${link.smap})`);
    }
    const checkAddr = (key: string, value: any) => {
      if (value === undefined) return;
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
import { assemble } from "./cli/mz80-as";
import { link } from "./cli/mz80-link";
import { dbgBinary } from "./cli/mz80-dbg";
import { dbgRemote } from "./cli/mz80-dbg-remote";
import { dap } from "./cli/mz80-dap";
import { Console } from "./console";

const program = new Command();

program.enablePositionalOptions();

function normalizeArgvForFullpath(argv: string[]): string[] {
  const out = [...argv];
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== "--fullpath") continue;
    const next = out[i + 1];
    if (!next || next.startsWith("-")) {
      out[i] = "--fullpath=rel";
      continue;
    }
    const low = String(next).toLowerCase();
    if (low === "off" || low === "rel" || low === "on") continue;
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
    const logLevel: "quiet" | "normal" | "verbose" = opts.quiet
      ? "quiet"
      : opts.verbose
        ? "verbose"
        : "normal";
    const logger = createLogger(logLevel);

    const configPath = path.resolve(process.cwd(), opts.config);
    logger.debug(`Using config path: ${configPath}`);

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
    const parsed = yaml.parse(content) as Mz80Config;
    const { valid, errors } = validateConfig(parsed ?? {});
    if (!valid) {
      const msg = `Config validation failed:\n${errors.map(e => `- ${e}`).join("\n")}`;
      if (opts.json) {
        console.error(JSON.stringify({ error: "config validation failed", details: errors }, null, 2));
      } else {
        logger.error(msg);
      }
      process.exit(1);
    }

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
  .option("--rel-version <version>", "Specify the .rel version (1 or 2)", "2")
  .option("--sym", "Generate .sym file")
  .option("--lst", "Generate .lst file")
  .option("--smap", "Generate .smap file")
  .option("--sjasm-compat", "Enable sjasm/8080 compatibility aliases (e.g. operand M -> (HL))")
  .option("--symlen <n>", "Default symbol length (.SYMLEN)", "32")
  .option("-I, --include <path...>", "Add include search path(s)")
  .option("--inc <path...>", "Add include search path(s) (alias)")
  .option("--verbose", "Show detailed output")
  .option("--quiet", "Suppress logs")
  .action((input, output, opts, command) => {
    const logLevel: "quiet" | "normal" | "verbose" = opts.quiet
      ? "quiet"
      : opts.verbose
        ? "verbose"
        : "normal";
    const logger = createLogger(logLevel);
    const globalOpts = program.opts();
    const configPath = path.resolve(process.cwd(), globalOpts.config ?? "mz80.yaml");
    const cfg = loadConfigFile(configPath, logger);

    if (cfg.as) {
      if (shouldUseConfig(command.getOptionValueSource("relVersion")))
        opts.relVersion = (cfg.as.relVersion as any) ?? opts.relVersion;
      if (shouldUseConfig(command.getOptionValueSource("sym")))
        opts.sym = cfg.as.sym ?? opts.sym;
      if (shouldUseConfig(command.getOptionValueSource("lst")))
        opts.lst = cfg.as.lst ?? opts.lst;
      if (shouldUseConfig(command.getOptionValueSource("symlen")))
        opts.symlen = (cfg.as.symLen as any) ?? opts.symlen;
      if (shouldUseConfig(command.getOptionValueSource("sjasmCompat")))
        opts.sjasmCompat = cfg.as.sjasmCompat ?? opts.sjasmCompat;
      if (shouldUseConfig(command.getOptionValueSource("smap")))
        opts.smap = cfg.as.smap ?? opts.smap;
    }

    const relVersion = String(opts.relVersion ?? "2") === "2" ? 2 : 1;
    const includeCli = [
      ...(opts.include ?? []),
      ...(opts.inc ?? []),
    ];
    const includePaths =
      includeCli.length > 0
        ? includeCli
        : (cfg.as?.includePaths ?? []);
    const symLen = Number(opts.symlen ?? "32");

    const out = new Console(opts.verbose);

    try {
      assemble(logger, input, output, {
        verbose: !!opts.verbose,
        relVersion,
        sym: !!opts.sym,
        lst: !!opts.lst,
        smap: !!opts.smap,
        sjasmCompat: !!opts.sjasmCompat,
        symLen: Number.isFinite(symLen) ? symLen : undefined,
        includePaths,
      });
      out.success(`Assembled: ${input} → ${output}`);
    } catch (err: any) {
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
  .option("--smap", "Generate .smap file")
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
  .action((output, inputs: string[], opts, command) => {
    try {
      const globalOpts = program.opts();
      const configPath = path.resolve(process.cwd(), globalOpts.config ?? "mz80.yaml");
      const logger = createLogger(opts.quiet ? "quiet" : opts.verbose ? "verbose" : "normal");
      const cfg = loadConfigFile(configPath, logger);

      if (cfg.link) {
        if (shouldUseConfig(command.getOptionValueSource("map"))) opts.map = cfg.link.map ?? opts.map;
        if (shouldUseConfig(command.getOptionValueSource("sym"))) opts.sym = cfg.link.sym ?? opts.sym;
        if (shouldUseConfig(command.getOptionValueSource("smap"))) opts.smap = cfg.link.smap ?? opts.smap;
        if (shouldUseConfig(command.getOptionValueSource("log"))) opts.log = cfg.link.log ?? opts.log;
        if (shouldUseConfig(command.getOptionValueSource("com"))) opts.com = cfg.link.com ?? opts.com;
        if (shouldUseConfig(command.getOptionValueSource("binFrom")))
          opts.binFrom = (cfg.link.binFrom as any) ?? opts.binFrom;
        if (shouldUseConfig(command.getOptionValueSource("binTo")))
          opts.binTo = (cfg.link.binTo as any) ?? opts.binTo;
        if (shouldUseConfig(command.getOptionValueSource("orgText")))
          opts.orgText = (cfg.link.orgText as any) ?? opts.orgText;
        if (shouldUseConfig(command.getOptionValueSource("orgData")))
          opts.orgData = (cfg.link.orgData as any) ?? opts.orgData;
        if (shouldUseConfig(command.getOptionValueSource("orgBss")))
          opts.orgBss = (cfg.link.orgBss as any) ?? opts.orgBss;
        if (shouldUseConfig(command.getOptionValueSource("orgCustom")))
          opts.orgCustom = (cfg.link.orgCustom as any) ?? opts.orgCustom;
        if (shouldUseConfig(command.getOptionValueSource("fullpath")))
          opts.fullpath = (cfg.link.fullpath as any) ?? opts.fullpath;
      }

      link(inputs, output, opts);
    } catch (err: any) {
      console.error(`❌ Link failed: ${err.message}`);
      process.exit(1);
    }
  });

// === サブコマンド: dbg ===
program
  .command("dbg <input>")
  .description("Debug binary image (.com/.bin): hexdump + lightweight decode")
  .option("--sym <file>", "symbol file for annotation (.sym)")
  .option("--smap <file>", "source map file for annotation (.smap)")
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
  .option("--rpc-stdio", "start debugger JSON-RPC server over stdio")
  .option("--rpc-listen <addr>", "start debugger JSON-RPC server over TCP (port or host:port)")
  .action((input, opts) => {
    try {
      dbgBinary(input, opts);
    } catch (err: any) {
      console.error(`❌ Debug failed: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command("dbg-remote")
  .description("Remote debugger client for dbg JSON-RPC server")
  .option("--connect <addr>", "remote address (host:port)", "127.0.0.1:4700")
  .option("--cmd <script>", "command script (e.g. \"ping; regs; break add 0100h\")")
  .action(async (opts) => {
    try {
      await dbgRemote(opts);
    } catch (err: any) {
      console.error(`❌ Remote debug failed: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command("dap")
  .description("Minimal Debug Adapter Protocol bridge over dbg JSON-RPC")
  .action(() => {
    try {
      dap();
    } catch (err: any) {
      console.error(`❌ DAP failed: ${err.message}`);
      process.exit(1);
    }
  });

// === サブコマンド: build ===
program
  .command("build")
  .description("Build the project (stub in P0 phase)")
  .action(() => {
    const opts = program.opts();
    const logLevel: "quiet" | "normal" | "verbose" = opts.quiet
      ? "quiet"
      : opts.verbose
        ? "verbose"
        : "normal";
    const logger = createLogger(logLevel);

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
    const logLevel: "quiet" | "normal" | "verbose" = opts.quiet
      ? "quiet"
      : opts.verbose
        ? "verbose"
        : "normal";
    const logger = createLogger(logLevel);

    logger.info("▶️ [run] Stub: run process not implemented yet.");
    if (opts.json) {
      console.log(JSON.stringify({ status: "ok", message: "run stub" }));
    }
  });

program.parse(normalizeArgvForFullpath(process.argv));

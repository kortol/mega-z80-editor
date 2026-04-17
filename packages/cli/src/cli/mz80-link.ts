import { parseRelFile } from "../linker/core/parser";
import { linkModules, linkModulesV2 } from "../linker/core/linker";
import { BinOutputAdapter } from "../linker/output/binAdapter";
import { MapAdapter } from "../linker/output/mapAdapter";
import { SymAdapter } from "../linker/output/symAdapter";
import { LogAdapter } from "../linker/output/logAdapter";

export function link(
  inputFiles: string[],
  outputFile: string,
  opts: {
    verbose?: boolean;
    map?: boolean;
    sym?: boolean;
    log?: boolean;
    com?: boolean;
    binFrom?: string | number;
    binTo?: string | number;
    orgText?: string | number;
    orgData?: string | number;
    orgBss?: string | number;
    orgCustom?: string | number;
    fullpath?: "off" | "rel" | "on" | boolean | string;
  }
) {
  const verbose = !!opts.verbose; 

  const mods = inputFiles.map((f) => {
    if (verbose) console.log(`[LOAD] ${f}`);
    return parseRelFile(f);
  });

  const hasV2 = mods.some((m) => m.version === 2);
  const hasV1 = mods.some((m) => !m.version || m.version === 1);
  if (hasV2 && hasV1) {
    throw new Error("Mixed .rel versions are not supported. Rebuild all modules with the same rel version.");
  }
  const orgText = parseAddr(opts.orgText);
  const orgData = parseAddr(opts.orgData);
  const orgBss = parseAddr(opts.orgBss);
  const orgCustom = parseAddr(opts.orgCustom);
  const result = hasV2
    ? linkModulesV2(mods, { orgText, orgData, orgBss, orgCustom })
    : linkModules(mods);
  if (verbose) {
    console.log(`[PASS1] Collected ${result.symbols.size} symbols`);
    console.log(`[PASS2] Linked ${result.segments.length} segment(s)`);
  }

  // .bin
  const binFrom = parseAddr(opts.binFrom);
  const binTo = parseAddr(opts.binTo);
  new BinOutputAdapter(result, { com: !!opts.com, binFrom, binTo }).write(outputFile, verbose);

  // .map
  if (opts.map) {
    const fullpath = normalizeFullpathMode(opts.fullpath);
    new MapAdapter(result, { fullpath, cwd: process.cwd() }).write(
      outputFile.replace(/\.[^.]+$/, ".map"),
      verbose
    );
  }

  // .sym
  if (opts.sym) {
    new SymAdapter(result).write(
      outputFile.replace(/\.[^.]+$/, ".sym"),
      verbose
    );
  }

  // .log
  if (opts.log) {
    // 現状はconsole.warnから収集予定 → 将来 logBuffer に差し替え
    new LogAdapter(result, result.warnings ?? []).write(
      outputFile.replace(/\.[^.]+$/, ".log"),
      verbose
    );
  }

  if (verbose) {
    console.log(`✅ Linked ${inputFiles.length} modules -> ${outputFile}`);
  }  
}

function normalizeFullpathMode(value: unknown): "off" | "rel" | "on" {
  if (value === true) return "rel";
  if (value === undefined || value === null) return "off";
  const t = String(value).trim().toLowerCase();
  if (t === "on" || t === "off" || t === "rel") return t;
  return "off";
}

function parseAddr(value?: string | number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const t = String(value).trim().toUpperCase();
  if (/^[0-9A-F]+H$/.test(t)) return parseInt(t.slice(0, -1), 16);
  if (/^0X[0-9A-F]+$/.test(t)) return parseInt(t.slice(2), 16);
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return undefined;
}

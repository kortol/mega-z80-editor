import { parseRelFile } from "./linker/core/parser";
import { linkModules, linkModulesV2 } from "./linker/core/linker";
import { BinOutputAdapter } from "./linker/output/binAdapter";
import { MapAdapter } from "./linker/output/mapAdapter";
import { SymAdapter } from "./linker/output/symAdapter";
import { LogAdapter } from "./linker/output/logAdapter";
import { isArchivePath, loadArchiveFile } from "./linker/archive";
import * as path from "path";
import { readSourceMap, SourceMapEntry, SourceMapFile, writeSourceMap } from "./sourcemap/model";
import { RelModule } from "./linker/core/types";
import fs from "node:fs";
import { LinkMemoryLayout, memoryAddress, normalizeMemoryLayout } from "./linker/memoryLayout";

export function link(
  inputFiles: string[],
  outputFile: string,
  opts: {
    verbose?: boolean;
    map?: boolean;
    sym?: boolean;
    smap?: boolean;
    log?: boolean;
    com?: boolean;
    binFrom?: string | number;
    binTo?: string | number;
    orgText?: string | number;
    orgData?: string | number;
    orgBss?: string | number;
    orgCustom?: string | number;
    fullpath?: "off" | "rel" | "on" | boolean | string;
    requireSymbols?: string[];
    memory?: LinkMemoryLayout;
  }
) {
  const verbose = !!opts.verbose; 

  const { mods, sourceMaps } = loadLinkInputs(inputFiles, verbose);

  const hasV2 = mods.some((m) => m.version === 2);
  const hasV1 = mods.some((m) => !m.version || m.version === 1);
  if (hasV2 && hasV1) {
    throw new Error("Mixed .rel versions are not supported. Rebuild all modules with the same rel version.");
  }
  const orgText = parseAddr(opts.orgText);
  const orgData = parseAddr(opts.orgData);
  const orgBss = parseAddr(opts.orgBss);
  const orgCustom = parseAddr(opts.orgCustom);
  if(opts.memory && !hasV2)throw new Error("memory: configured layouts require REL v2");
  if(opts.memory)for(const [label,value] of Object.entries({orgText:opts.orgText,orgData:opts.orgData,orgBss:opts.orgBss,orgCustom:opts.orgCustom,binFrom:opts.binFrom,binTo:opts.binTo}))if(value!==undefined)memoryAddress(value,label);
  const memory=opts.memory!==undefined?normalizeMemoryLayout(opts.memory):undefined;
  if(memory&&opts.com&&(memory.code.start!==0x100||memory.code.kind!=="ram"))throw new Error("memory: COM requires RAM code starting at 100H");
  const result = hasV2
    ? linkModulesV2(mods, { orgText, orgData, orgBss, orgCustom, memory:opts.memory })
    : linkModules(mods);
  const providedSymbolNames = new Set(
    mods.flatMap((module) => module.symbols
      .filter((symbol) => symbol.storage !== "EXT")
      .map((symbol) => symbol.name.toUpperCase())),
  );
  const missingRequiredSymbols = (opts.requireSymbols ?? []).filter((symbol) => !providedSymbolNames.has(symbol.toUpperCase()));
  if (missingRequiredSymbols.length > 0) {
    throw new Error(`Link requires symbol(s) that were not provided: ${missingRequiredSymbols.join(", ")}`);
  }
  if (verbose) {
    console.log(`[PASS1] Collected ${result.symbols.size} symbols`);
    console.log(`[PASS2] Linked ${result.segments.length} segment(s)`);
  }

  // .bin
  const binFrom = parseAddr(opts.binFrom)??(memory?.code.kind==="rom"?memory.code.start:undefined);
  const binTo = parseAddr(opts.binTo)??(memory?.code.kind==="rom"?memory.code.start+memory.code.size-1:undefined);
  if(memory?.code.kind==="rom"&&((binFrom!==undefined&&binFrom<memory.code.start)||(binTo!==undefined&&binTo>=memory.code.start+memory.code.size)))throw new Error("memory: binary range exceeds ROM region");
  if(memory)for(const segment of result.segments.filter(segment=>segment.data&&segment.data.length)){
    const start=segment.loadAddress??segment.range.min,end=start+segment.data!.length-1;
    if((binFrom!==undefined&&binFrom>start)||(binTo!==undefined&&binTo<end))throw new Error("memory: binary range truncates a loadable section");
  }
  new BinOutputAdapter(result, { com: !!opts.com, binFrom, binTo }).write(outputFile, verbose);
  if(result.memoryLayout)fs.writeFileSync(path.join(path.dirname(outputFile),path.basename(outputFile,path.extname(outputFile))+".memory.json"),JSON.stringify(result.memoryLayout,null,2)+"\n");

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

  if (opts.smap) {
    const outPath = outputFile.replace(/\.[^.]+$/, ".smap");
    const entries: SourceMapEntry[] = [];
    const sectionBaseIndex = new Map<string, number>();
    for (const b of result.moduleSectionBases ?? []) {
      sectionBaseIndex.set(`${b.moduleIndex}:${normalizeSection(b.section)}`, b.base & 0xffff);
    }

    mods.forEach((mod, i) => {
      const sm = sourceMaps[i];
      if (!sm) return;
      for (const e of sm.entries) {
        const sec = normalizeSection(e.section);
        const base = sectionBaseIndex.get(`${i}:${sec}`) ?? 0;
        entries.push({
          ...e,
          addr: (e.addr + base) & 0xffff,
          module: mod.name,
          section: sec,
        });
      }
    });
    const out: SourceMapFile = {
      version: 1,
      kind: "link",
      output: path.resolve(outputFile).replace(/\\/g, "/"),
      entries,
    };
    writeSourceMap(outPath, out);
  }

  if (verbose) {
    console.log(`✅ Linked ${inputFiles.length} modules -> ${outputFile}`);
  }  
}

function loadLinkInputs(
  inputFiles: string[],
  verbose: boolean,
): { mods: RelModule[]; sourceMaps: Array<SourceMapFile | null> } {
  const directMods: RelModule[] = [];
  const directMaps: Array<SourceMapFile | null> = [];
  const archives = [];

  for (const filePath of inputFiles) {
    if (isArchivePath(filePath)) {
      if (verbose) console.log(`[ARCHIVE] ${filePath}`);
      archives.push(loadArchiveFile(filePath));
      continue;
    }
    if (verbose) console.log(`[LOAD] ${filePath}`);
    directMods.push(parseRelFile(filePath));
    directMaps.push(readSourceMap(filePath.replace(/\.[^.]+$/, ".smap")));
  }

  if (archives.length === 0) {
    return { mods: directMods, sourceMaps: directMaps };
  }

  const selectedMods = [...directMods];
  const selectedMaps = [...directMaps];
  const satisfied = new Set<string>();
  const unresolved = new Set<string>();

  const refreshState = () => {
    satisfied.clear();
    unresolved.clear();
    for (const mod of selectedMods) {
      for (const sym of mod.symbols) {
        if (sym.storage !== "EXT") satisfied.add(sym.name);
      }
    }
    for (const mod of selectedMods) {
      for (const ext of mod.externs) {
        if (!satisfied.has(ext)) unresolved.add(ext);
      }
    }
  };

  refreshState();

  let changed = true;
  const usedMembers = new Set<string>();
  while (changed) {
    changed = false;
    for (const archive of archives) {
      for (const member of archive.members) {
        const memberKey = `${archive.path}:${member.name}`;
        if (usedMembers.has(memberKey)) continue;
        const provides = member.module.symbols.some((sym) => sym.storage !== "EXT" && unresolved.has(sym.name));
        if (!provides) continue;
        if (verbose) console.log(`[ARCHIVE-LOAD] ${archive.path} -> ${member.name}`);
        usedMembers.add(memberKey);
        selectedMods.push(member.module);
        selectedMaps.push(null);
        refreshState();
        changed = true;
      }
    }
  }

  return { mods: selectedMods, sourceMaps: selectedMaps };
}

function normalizeSection(section?: string): string {
  return (section ?? "CSEG").replace(/^\./, "").toUpperCase();
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

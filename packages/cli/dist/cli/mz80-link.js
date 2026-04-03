"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.link = link;
const parser_1 = require("../linker/core/parser");
const linker_1 = require("../linker/core/linker");
const binAdapter_1 = require("../linker/output/binAdapter");
const mapAdapter_1 = require("../linker/output/mapAdapter");
const symAdapter_1 = require("../linker/output/symAdapter");
const logAdapter_1 = require("../linker/output/logAdapter");
function link(inputFiles, outputFile, opts) {
    const verbose = !!opts.verbose;
    const mods = inputFiles.map((f) => {
        if (verbose)
            console.log(`[LOAD] ${f}`);
        return (0, parser_1.parseRelFile)(f);
    });
    const result = (0, linker_1.linkModules)(mods);
    if (verbose) {
        console.log(`[PASS1] Collected ${result.symbols.size} symbols`);
        console.log(`[PASS2] Linked ${result.segments.length} segment(s)`);
    }
    // .bin
    new binAdapter_1.BinOutputAdapter(result).write(outputFile, verbose);
    // .map
    if (opts.map) {
        new mapAdapter_1.MapAdapter(result).write(outputFile.replace(/\.[^.]+$/, ".map"), verbose);
    }
    // .sym
    if (opts.sym) {
        new symAdapter_1.SymAdapter(result).write(outputFile.replace(/\.[^.]+$/, ".sym"), verbose);
    }
    // .log
    if (opts.log) {
        // 現状はconsole.warnから収集予定 → 将来 logBuffer に差し替え
        new logAdapter_1.LogAdapter(result, []).write(outputFile.replace(/\.[^.]+$/, ".log"), verbose);
    }
    if (verbose) {
        console.log(`✅ Linked ${inputFiles.length} modules -> ${outputFile}`);
    }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAssemblerSourceMap = buildAssemblerSourceMap;
const model_1 = require("../../sourcemap/model");
function buildAssemblerSourceMap(ctx, inputFile, outputFile) {
    const sectionNameById = new Map();
    for (const sec of ctx.sections.values()) {
        sectionNameById.set(sec.id, sec.name);
    }
    const entries = [];
    const listing = ctx.listing ?? [];
    for (const l of listing) {
        const size = l.bytes?.length ?? 0;
        if (size <= 0)
            continue;
        if (!l.pos?.file)
            continue;
        entries.push({
            addr: l.addr & 0xffff,
            size,
            file: (0, model_1.normalizeMapPath)(l.pos.file),
            line: Math.max(1, (l.pos.line ?? 0) + 1),
            column: l.pos.column != null ? Math.max(1, l.pos.column + 1) : undefined,
            module: ctx.moduleName,
            section: sectionNameById.get(l.sectionId ?? ctx.currentSection),
        });
    }
    return {
        version: 1,
        kind: "as",
        module: ctx.moduleName,
        output: (0, model_1.normalizeMapPath)(outputFile),
        entries,
    };
}

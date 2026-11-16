"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTsAbiLinkInputs = validateTsAbiLinkInputs;
const core_1 = require("@mz80/core");
/** Reject an ordinary stack-ABI reference to a static-frame-only entry. */
function validateTsAbiLinkInputs(files) {
    const modules = files.flatMap((file) => /\.(lib|a|mza)$/i.test(file)
        ? (0, core_1.loadArchiveFile)(file).members.map((member) => member.module)
        : [(0, core_1.parseRelFile)(file)]);
    const definitions = new Set(modules.flatMap((mod) => mod.symbols.filter((s) => s.storage !== "EXT").map((s) => s.name.toUpperCase())));
    const prefix = "__TS_STATIC_FRAME_V1_";
    for (const mod of modules) {
        for (const symbol of [...mod.externs, ...mod.symbols.filter((s) => s.storage === "EXT").map((s) => s.name)]) {
            const name = symbol.toUpperCase();
            if (!definitions.has(name) && definitions.has(prefix + name)) {
                throw new Error(`TS ABI mismatch: '${symbol}' requires ts-internal, but its definition uses ts-static-frame v1`);
            }
        }
    }
}

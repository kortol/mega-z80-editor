"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDbgSourceMap = parseDbgSourceMap;
exports.buildAddrToSourceEntry = buildAddrToSourceEntry;
const model_1 = require("../sourcemap/model");
function parseDbgSourceMap(smapPath) {
    const sm = (0, model_1.readSourceMap)(smapPath);
    return sm?.entries ?? [];
}
function buildAddrToSourceEntry(entries) {
    return (0, model_1.buildAddrToSource)(entries);
}

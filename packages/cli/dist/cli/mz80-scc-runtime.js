"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeSccRuntimeFile = writeSccRuntimeFile;
const runtime_1 = require("../scc/runtime");
function writeSccRuntimeFile(logger, runtimeName, outputFile) {
    (0, runtime_1.writeBundledSccRuntime)(runtimeName, outputFile);
    logger.info(`Wrote SCC runtime: ${runtimeName} -> ${outputFile}`);
}

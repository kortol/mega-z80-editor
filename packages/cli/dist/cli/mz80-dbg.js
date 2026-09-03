"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbgBinary = dbgBinary;
const core_1 = require("@mz80/core");
function dbgBinary(inputFile, opts) {
    (0, core_1.dbgBinary)(inputFile, opts);
}

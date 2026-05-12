"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbgBinary = dbgBinary;
const binaryDebugger_1 = require("../debugger/binaryDebugger");
function dbgBinary(inputFile, opts) {
    (0, binaryDebugger_1.dbgBinary)(inputFile, opts);
}

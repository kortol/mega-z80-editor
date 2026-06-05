"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateSccAsmFile = translateSccAsmFile;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const translateAsm_1 = require("../scc/translateAsm");
function translateSccAsmFile(logger, inputFile, outputFile) {
    const source = fs_1.default.readFileSync(inputFile, "utf-8");
    const translated = (0, translateAsm_1.translateSccAsm)(source, {
        moduleName: path_1.default.basename(inputFile),
    });
    fs_1.default.mkdirSync(path_1.default.dirname(outputFile), { recursive: true });
    fs_1.default.writeFileSync(outputFile, translated, "utf-8");
    logger.info(`Translated SCC asm: ${inputFile} -> ${outputFile}`);
}

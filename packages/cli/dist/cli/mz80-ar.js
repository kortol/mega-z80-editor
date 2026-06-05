"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.archiveRelFiles = archiveRelFiles;
const path_1 = __importDefault(require("path"));
const archive_1 = require("../linker/archive");
function archiveRelFiles(logger, outputFile, inputFiles) {
    (0, archive_1.createArchive)(inputFiles.map((file) => path_1.default.resolve(file)), path_1.default.resolve(outputFile));
    logger.info(`Archived ${inputFiles.length} file(s): ${outputFile}`);
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSccLibraryArchive = buildSccLibraryArchive;
const node_path_1 = __importDefault(require("node:path"));
const buildLibrary_1 = require("../scc/buildLibrary");
const libraryPresets_1 = require("../scc/libraryPresets");
function buildSccLibraryArchive(logger, outputFile, inputFiles, opts) {
    const resolvedInputs = opts.preset
        ? [
            ...(0, libraryPresets_1.resolveSccLibraryPreset)(opts.preset).map((file) => node_path_1.default.resolve(inputFiles[0], file)),
            ...inputFiles.slice(1).map((file) => node_path_1.default.resolve(file)),
        ]
        : inputFiles.map((file) => node_path_1.default.resolve(file));
    (0, buildLibrary_1.buildSccLibrary)(logger, {
        outputFile: node_path_1.default.resolve(outputFile),
        inputFiles: resolvedInputs,
        includeDirs: opts.include ?? [],
        cppArgs: opts.cppArg ?? [],
        sccArgs: opts.sccArg ?? [],
        dcppPath: opts.dcpp,
        sccz80Path: opts.sccz80,
        tempDir: opts.tempDir ? node_path_1.default.resolve(opts.tempDir) : undefined,
        keepTemps: opts.keepTemps,
        verbose: opts.verbose,
        toolMode: opts.wsl ? "wsl" : "host",
    });
}

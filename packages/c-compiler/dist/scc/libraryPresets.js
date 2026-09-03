"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCC_LIBRARY_PRESETS = void 0;
exports.resolveSccLibraryPreset = resolveSccLibraryPreset;
exports.SCC_LIBRARY_PRESETS = {
    "cpm-stdio": [
        "CHARCLAS.C",
        "FGETS.C",
        "FPUTS.C",
        "GETCHAR.C",
        "GETS.C",
        "PUTCHAR.C",
        "PUTS.C",
        "STRLEN.C",
    ],
};
function resolveSccLibraryPreset(name) {
    return [...exports.SCC_LIBRARY_PRESETS[name]];
}

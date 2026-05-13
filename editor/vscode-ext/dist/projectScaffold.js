"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateProjectFromFolders = generateProjectFromFolders;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
function generateProjectFromFolders(workspaceRoot, existing) {
    const srcDir = path.join(workspaceRoot, "src");
    if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
        throw new Error("Expected a 'src' directory in the workspace root.");
    }
    const asmFiles = fs.readdirSync(srcDir)
        .filter((name) => /\.asm$/i.test(name))
        .sort((a, b) => a.localeCompare(b));
    if (asmFiles.length === 0) {
        throw new Error("No .asm files were found under src/.");
    }
    const workspaceName = path.basename(workspaceRoot);
    const targetName = sanitizeTargetName(workspaceName);
    const outputExt = "com";
    return {
        ...(existing ?? {}),
        version: 1,
        project: {
            ...(existing?.project ?? {}),
            defaultTarget: targetName,
        },
        targets: {
            ...(existing?.targets ?? {}),
            [targetName]: {
                output: `build/${targetName}.${outputExt}`,
                modules: asmFiles.map((name) => ({
                    source: `src/${name}`,
                    object: `build/${name.replace(/\.asm$/i, ".rel")}`,
                })),
                as: {
                    sym: true,
                    lst: true,
                    smap: true,
                },
                link: {
                    com: true,
                    map: true,
                    sym: true,
                    smap: true,
                    log: true,
                },
                debug: {
                    cpm: true,
                    cpmInteractive: true,
                },
            },
        },
    };
}
function sanitizeTargetName(name) {
    const cleaned = name.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return cleaned.length > 0 ? cleaned : "default";
}

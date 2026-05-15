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
exports.cleanProjectOutputs = cleanProjectOutputs;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const cleanPatterns_1 = require("./cleanPatterns");
function cleanProjectOutputs(projectRoot, project) {
    const clean = project.project?.clean ?? (0, cleanPatterns_1.synthesizeProjectClean)(project);
    const result = {
        deleted: [],
        missing: [],
        skippedOutsideRoot: [],
        skippedDirectories: [],
    };
    for (const relPath of clean?.files ?? []) {
        const resolved = path.resolve(projectRoot, relPath);
        if (!isWithinRoot(projectRoot, resolved)) {
            result.skippedOutsideRoot.push(resolved);
            continue;
        }
        if (!fs.existsSync(resolved)) {
            result.missing.push(resolved);
            continue;
        }
        const stat = fs.lstatSync(resolved);
        if (stat.isDirectory()) {
            result.skippedDirectories.push(resolved);
            continue;
        }
        fs.unlinkSync(resolved);
        result.deleted.push(resolved);
    }
    return result;
}
function isWithinRoot(root, candidate) {
    const rel = path.relative(root, candidate);
    if (path.resolve(root) === path.resolve(candidate)) {
        return true;
    }
    return rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel);
}

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
exports.generateLaunchJson = generateLaunchJson;
exports.writeLaunchJson = writeLaunchJson;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const projectConfig_1 = require("./projectConfig");
const projectBuild_1 = require("./projectBuild");
function generateLaunchJson(workspaceRoot, projectRoot, project) {
    const configurations = [];
    const targetNames = project.targets ? Object.keys(project.targets) : [];
    for (const targetName of targetNames) {
        const target = (0, projectConfig_1.resolveTarget)(projectRoot, project, targetName);
        if (!target)
            continue;
        configurations.push(makeTargetLaunch(workspaceRoot, projectRoot, target));
        configurations.push(makeProgramLaunch(workspaceRoot, projectRoot, target));
    }
    configurations.push({
        name: "MZ80 Attach (RPC 4700)",
        type: "mz80-dap",
        request: "attach",
        connect: "127.0.0.1:4700",
        cwd: toWorkspacePath(workspaceRoot, projectRoot),
    });
    return {
        version: "0.2.0",
        configurations,
    };
}
async function writeLaunchJson(workspaceRoot, launchJson) {
    const vscodeDir = path.join(workspaceRoot, ".vscode");
    fs.mkdirSync(vscodeDir, { recursive: true });
    const launchPath = path.join(vscodeDir, "launch.json");
    fs.writeFileSync(launchPath, JSON.stringify(launchJson, null, 2));
    return launchPath;
}
function makeTargetLaunch(workspaceRoot, projectRoot, target) {
    return {
        name: `MZ80 Launch (${target.name} target)`,
        type: "mz80-dap",
        request: "launch",
        cwd: toWorkspacePath(workspaceRoot, projectRoot),
        target: target.name,
    };
}
function makeProgramLaunch(workspaceRoot, projectRoot, target) {
    const launch = (0, projectBuild_1.toLaunchConfiguration)(target);
    return {
        name: `MZ80 Launch (${path.basename(target.output)})`,
        type: "mz80-dap",
        request: "launch",
        cwd: toWorkspacePath(workspaceRoot, projectRoot),
        program: toWorkspacePath(workspaceRoot, target.output),
        sym: typeof launch.sym === "string" ? toWorkspacePath(workspaceRoot, launch.sym) : undefined,
        smap: typeof launch.smap === "string" ? toWorkspacePath(workspaceRoot, launch.smap) : undefined,
        cpm: launch.cpm,
        cpmInteractive: launch.cpmInteractive,
        base: launch.base,
        rpcListen: launch.rpcListen,
    };
}
function toWorkspacePath(workspaceRoot, filePath) {
    const rel = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
    return rel.length > 0 ? `\${workspaceFolder}/${rel}` : "${workspaceFolder}";
}

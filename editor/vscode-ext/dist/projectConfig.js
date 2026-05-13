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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_CONFIG_FILE = void 0;
exports.getProjectConfigPath = getProjectConfigPath;
exports.loadProjectFile = loadProjectFile;
exports.saveProjectFile = saveProjectFile;
exports.listTargetNames = listTargetNames;
exports.resolveTargetName = resolveTargetName;
exports.resolveTarget = resolveTarget;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const yaml_1 = __importDefault(require("yaml"));
exports.PROJECT_CONFIG_FILE = "mz80.yaml";
function getProjectConfigPath(workspaceRoot) {
    return path.join(workspaceRoot, exports.PROJECT_CONFIG_FILE);
}
function loadProjectFile(workspaceRoot) {
    const configPath = getProjectConfigPath(workspaceRoot);
    if (!fs.existsSync(configPath))
        return undefined;
    const content = fs.readFileSync(configPath, "utf8");
    const parsed = yaml_1.default.parse(content);
    if (!parsed || typeof parsed !== "object")
        return undefined;
    return parsed;
}
function saveProjectFile(workspaceRoot, project) {
    const configPath = getProjectConfigPath(workspaceRoot);
    const text = yaml_1.default.stringify(project, {
        defaultKeyType: "PLAIN",
        lineWidth: 0,
    });
    fs.writeFileSync(configPath, text, "utf8");
}
function listTargetNames(project) {
    return project?.targets ? Object.keys(project.targets) : [];
}
function resolveTargetName(project, preferred) {
    const targetNames = listTargetNames(project);
    if (preferred && project?.targets?.[preferred])
        return preferred;
    if (project?.project?.defaultTarget && project.targets?.[project.project.defaultTarget]) {
        return project.project.defaultTarget;
    }
    if (targetNames.length === 1)
        return targetNames[0];
    return undefined;
}
function deriveObjectPath(target, modulePath) {
    const outDir = path.dirname(target);
    const base = path.basename(modulePath).replace(/\.[^.]+$/, ".rel");
    return path.join(outDir, base);
}
function resolveTarget(workspaceRoot, project, targetName) {
    const raw = project.targets?.[targetName];
    if (!raw)
        return undefined;
    const modules = raw.modules.map((entry) => {
        if (typeof entry === "string") {
            return {
                source: path.resolve(workspaceRoot, entry),
                object: path.resolve(workspaceRoot, deriveObjectPath(raw.output, entry)),
            };
        }
        return {
            source: path.resolve(workspaceRoot, entry.source),
            object: path.resolve(workspaceRoot, entry.object && entry.object.trim().length > 0
                ? entry.object
                : deriveObjectPath(raw.output, entry.source)),
        };
    });
    return {
        ...raw,
        name: targetName,
        output: path.resolve(workspaceRoot, raw.output),
        modules,
    };
}

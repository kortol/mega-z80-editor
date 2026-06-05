"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultRunTool = void 0;
exports.buildCppArgs = buildCppArgs;
exports.prepareToolchainIncludeDirs = prepareToolchainIncludeDirs;
exports.findGeneratedSccAsm = findGeneratedSccAsm;
exports.safeRmDir = safeRmDir;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
function buildCppArgs(includeDirs = [], cppArgs = []) {
    const args = [];
    for (const includeDir of includeDirs) {
        args.push(`-I${node_path_1.default.resolve(includeDir)}`);
    }
    return [...args, ...cppArgs];
}
function prepareToolchainIncludeDirs(tempDir, toolMode, includeDirs) {
    return toolMode === "wsl"
        ? prepareWslIncludeDirs(tempDir, includeDirs)
        : includeDirs;
}
function findGeneratedSccAsm(stageDir, stem) {
    const candidates = [
        node_path_1.default.join(stageDir, `${stem}.asm`),
        node_path_1.default.join(stageDir, `${stem}.ASM`),
    ];
    for (const candidate of candidates) {
        if (node_fs_1.default.existsSync(candidate))
            return candidate;
    }
    const allAsmFiles = node_fs_1.default.readdirSync(stageDir)
        .filter((entry) => /\.asm$/i.test(entry))
        .map((entry) => node_path_1.default.join(stageDir, entry));
    if (allAsmFiles.length === 1)
        return allAsmFiles[0];
    throw new Error(`Could not find SCC asm output in ${stageDir}`);
}
const defaultRunTool = (command, args, cwd, toolMode) => {
    const hostNeedsShell = toolMode === "host" && /\.(cmd|bat)$/i.test(command);
    const result = toolMode === "wsl"
        ? (0, node_child_process_1.spawnSync)("wsl", buildWslArgs(command, args, cwd), {
            stdio: "pipe",
            encoding: "utf8",
        })
        : (0, node_child_process_1.spawnSync)(command, args, {
            cwd,
            stdio: "pipe",
            encoding: "utf8",
            shell: hostNeedsShell,
        });
    if (result.error)
        throw result.error;
    if (result.status !== 0) {
        const stderr = (result.stderr ?? "").trim();
        const stdout = (result.stdout ?? "").trim();
        throw new Error([command, ...args].join(" ")
            + (stderr ? ` failed: ${stderr}` : stdout ? ` failed: ${stdout}` : " failed"));
    }
};
exports.defaultRunTool = defaultRunTool;
function safeRmDir(dirPath) {
    try {
        node_fs_1.default.rmSync(dirPath, { recursive: true, force: true });
    }
    catch {
        // best effort cleanup only
    }
}
function prepareWslIncludeDirs(tempDir, includeDirs) {
    if (includeDirs.length === 0)
        return includeDirs;
    const shadowRoot = node_path_1.default.join(tempDir, "_include_shadow");
    node_fs_1.default.mkdirSync(shadowRoot, { recursive: true });
    const ordered = [];
    for (const includeDir of includeDirs) {
        const resolved = node_path_1.default.resolve(includeDir);
        const shadowDir = node_path_1.default.join(shadowRoot, node_path_1.default.basename(resolved).toLowerCase());
        node_fs_1.default.rmSync(shadowDir, { recursive: true, force: true });
        node_fs_1.default.mkdirSync(shadowDir, { recursive: true });
        for (const entry of node_fs_1.default.readdirSync(resolved, { withFileTypes: true })) {
            if (!entry.isFile())
                continue;
            const src = node_path_1.default.join(resolved, entry.name);
            node_fs_1.default.copyFileSync(src, node_path_1.default.join(shadowDir, entry.name.toLowerCase()));
        }
        ordered.push(shadowDir, resolved);
    }
    return ordered;
}
function buildWslArgs(command, args, cwd) {
    const linuxCwd = toWslPath(cwd);
    const linuxArgs = args.map((arg) => maybeToWslPath(arg));
    const shellCommand = [command, ...linuxArgs].map(shellQuote).join(" ");
    return ["bash", "-lc", `cd ${shellQuote(linuxCwd)} && ${shellCommand}`];
}
function maybeToWslPath(value) {
    if (/^-I[A-Za-z]:[\\/]/.test(value)) {
        return `-I${toWslPath(value.slice(2))}`;
    }
    if (/^[A-Za-z]:[\\/]/.test(value)) {
        return toWslPath(value);
    }
    return value;
}
function toWslPath(winPath) {
    const normalized = node_path_1.default.resolve(winPath).replace(/\\/g, "/");
    const drive = normalized[0]?.toLowerCase();
    if (!drive || normalized[1] !== ":") {
        return normalized;
    }
    return `/mnt/${drive}${normalized.slice(2)}`;
}
function shellQuote(value) {
    return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

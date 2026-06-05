"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSccLibrary = buildSccLibrary;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const mz80_as_1 = require("../cli/mz80-as");
const archive_1 = require("../linker/archive");
const translateAsm_1 = require("./translateAsm");
function buildSccLibrary(logger, opts, deps = {}) {
    const runTool = deps.runTool ?? defaultRunTool;
    const assembleFile = deps.assembleFile ?? mz80_as_1.assemble;
    const archiveFiles = deps.archiveFiles ?? archive_1.createArchive;
    const tempDir = opts.tempDir
        ? node_path_1.default.resolve(opts.tempDir)
        : node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "mz80-scc-lib-"));
    node_fs_1.default.mkdirSync(tempDir, { recursive: true });
    const relFiles = [];
    const toolMode = opts.toolMode ?? "host";
    const includeDirs = toolMode === "wsl"
        ? prepareWslIncludeDirs(tempDir, opts.includeDirs ?? [])
        : (opts.includeDirs ?? []);
    try {
        for (const inputFile of opts.inputFiles) {
            const resolvedInput = node_path_1.default.resolve(inputFile);
            const stem = node_path_1.default.basename(resolvedInput, node_path_1.default.extname(resolvedInput)).toLowerCase();
            const stageDir = node_path_1.default.join(tempDir, stem);
            node_fs_1.default.mkdirSync(stageDir, { recursive: true });
            const prePath = node_path_1.default.join(stageDir, `${stem}.i`);
            const preArg = toolMode === "wsl" ? node_path_1.default.basename(prePath) : prePath;
            const sccAsmPath = node_path_1.default.join(stageDir, `${stem}.scc.asm`);
            const mz80AsmPath = node_path_1.default.join(stageDir, `${stem}.asm`);
            const relPath = node_path_1.default.join(stageDir, `${stem}.rel`);
            runTool(opts.dcppPath ?? "dcpp", [...buildCppArgs(includeDirs, opts.cppArgs), resolvedInput, preArg], stageDir, toolMode);
            runTool(opts.sccz80Path ?? "sccz80", [...(opts.sccArgs ?? []), preArg], stageDir, toolMode);
            const generatedAsmPath = findGeneratedSccAsm(stageDir, stem);
            node_fs_1.default.copyFileSync(generatedAsmPath, sccAsmPath);
            const translated = (0, translateAsm_1.translateSccAsm)(node_fs_1.default.readFileSync(sccAsmPath, "utf8"), {
                moduleName: node_path_1.default.basename(sccAsmPath),
            });
            node_fs_1.default.writeFileSync(mz80AsmPath, translated, "utf8");
            const ctx = assembleFile(logger, mz80AsmPath, relPath, { relVersion: 2, verbose: opts.verbose });
            if (ctx.errors.length > 0) {
                throw new Error(`Assembly failed for ${resolvedInput}: ${ctx.errors.map((e) => e.message).join("; ")}`);
            }
            relFiles.push(relPath);
        }
        const archivePath = node_path_1.default.resolve(opts.outputFile);
        archiveFiles(relFiles, archivePath);
        logger.info(`Built SCC library: ${archivePath}`);
        return { archivePath, relFiles, tempDir };
    }
    catch (error) {
        if (!opts.keepTemps && !opts.tempDir) {
            safeRmDir(tempDir);
        }
        throw error;
    }
}
function buildCppArgs(includeDirs = [], cppArgs = []) {
    const args = [];
    for (const includeDir of includeDirs) {
        args.push(`-I${node_path_1.default.resolve(includeDir)}`);
    }
    return [...args, ...cppArgs];
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
function defaultRunTool(command, args, cwd, toolMode) {
    const result = toolMode === "wsl"
        ? (0, node_child_process_1.spawnSync)("wsl", buildWslArgs(command, args, cwd), {
            stdio: "pipe",
            encoding: "utf8",
        })
        : (0, node_child_process_1.spawnSync)(command, args, {
            cwd,
            stdio: "pipe",
            encoding: "utf8",
        });
    if (result.error)
        throw result.error;
    if (result.status !== 0) {
        const stderr = (result.stderr ?? "").trim();
        const stdout = (result.stdout ?? "").trim();
        throw new Error([command, ...args].join(" ")
            + (stderr ? ` failed: ${stderr}` : stdout ? ` failed: ${stdout}` : " failed"));
    }
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
function safeRmDir(dirPath) {
    try {
        node_fs_1.default.rmSync(dirPath, { recursive: true, force: true });
    }
    catch {
        // best effort cleanup only
    }
}

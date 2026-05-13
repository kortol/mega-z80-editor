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
exports.buildTarget = buildTarget;
exports.toLaunchConfiguration = toLaunchConfiguration;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
async function buildTarget(target, options) {
    for (const moduleEntry of target.modules) {
        fs.mkdirSync(path.dirname(moduleEntry.object), { recursive: true });
        const args = [
            options.cliEntry,
            "as",
            moduleEntry.source,
            moduleEntry.object,
            ...buildAssemblerArgs(target.as, options.workspaceRoot),
        ];
        await runCli(args, options, `[as] ${path.basename(moduleEntry.source)}`);
    }
    fs.mkdirSync(path.dirname(target.output), { recursive: true });
    const linkArgs = [
        options.cliEntry,
        "link",
        target.output,
        ...target.modules.map((entry) => entry.object),
        ...buildLinkArgs(target.link),
    ];
    await runCli(linkArgs, options, `[link] ${path.basename(target.output)}`);
}
function toLaunchConfiguration(target) {
    const link = target.link ?? {};
    const debug = target.debug ?? {};
    const program = target.output;
    const baseName = program.replace(/\.[^.]+$/, "");
    return {
        type: "mz80-dap",
        name: `MZ80 Launch (${target.name})`,
        request: "launch",
        program,
        sym: link.sym ? `${baseName}.sym` : undefined,
        smap: link.smap ? `${baseName}.smap` : undefined,
        cpm: debug.cpm ?? link.com ?? /\.com$/i.test(program),
        cpmInteractive: debug.cpmInteractive ?? (debug.cpm ?? link.com ?? /\.com$/i.test(program)),
        base: debug.base,
        rpcListen: debug.rpcListen,
    };
}
function buildAssemblerArgs(options, workspaceRoot) {
    if (!options)
        return [];
    const args = [];
    if (options.relVersion !== undefined)
        args.push("--rel-version", String(options.relVersion));
    if (options.sym)
        args.push("--sym");
    if (options.lst)
        args.push("--lst");
    if (options.smap)
        args.push("--smap");
    if (options.sjasmCompat)
        args.push("--sjasm-compat");
    if (options.symLen !== undefined)
        args.push("--symlen", String(options.symLen));
    for (const includePath of options.includePaths ?? []) {
        args.push("--include", path.resolve(workspaceRoot, includePath));
    }
    return args;
}
function buildLinkArgs(options) {
    if (!options)
        return [];
    const args = [];
    if (options.map)
        args.push("--map");
    if (options.sym)
        args.push("--sym");
    if (options.smap)
        args.push("--smap");
    if (options.log)
        args.push("--log");
    if (options.com)
        args.push("--com");
    if (options.binFrom !== undefined)
        args.push("--bin-from", String(options.binFrom));
    if (options.binTo !== undefined)
        args.push("--bin-to", String(options.binTo));
    if (options.orgText !== undefined)
        args.push("--org-text", String(options.orgText));
    if (options.orgData !== undefined)
        args.push("--org-data", String(options.orgData));
    if (options.orgBss !== undefined)
        args.push("--org-bss", String(options.orgBss));
    if (options.orgCustom !== undefined)
        args.push("--org-custom", String(options.orgCustom));
    if (options.fullpath !== undefined)
        args.push("--fullpath", String(options.fullpath));
    return args;
}
function runCli(args, options, label) {
    return new Promise((resolve, reject) => {
        options.output.appendLine(`${label}: node ${args.join(" ")}`);
        const child = (0, node_child_process_1.spawn)("node", args, {
            cwd: options.workspaceRoot,
            stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout.on("data", (chunk) => options.output.append(chunk.toString()));
        child.stderr.on("data", (chunk) => options.output.append(chunk.toString()));
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${label} failed with exit code ${code ?? "?"}`));
        });
    });
}

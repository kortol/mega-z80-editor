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
exports.createArchive = createArchive;
exports.isArchivePath = isArchivePath;
exports.loadArchiveFile = loadArchiveFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parser_1 = require("./core/parser");
const ARCHIVE_MAGIC = "MZ80AR1";
function createArchive(inputFiles, outputFile) {
    const members = inputFiles.map((inputFile) => {
        const buf = fs.readFileSync(inputFile);
        return {
            name: path.basename(inputFile),
            dataBase64: buf.toString("base64"),
        };
    });
    const archive = {
        magic: ARCHIVE_MAGIC,
        version: 1,
        members,
    };
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(archive, null, 2), "utf8");
}
function isArchivePath(filePath) {
    return /\.(?:a|lib|mza)$/i.test(filePath);
}
function loadArchiveFile(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.magic !== ARCHIVE_MAGIC || parsed.version !== 1 || !Array.isArray(parsed.members)) {
        throw new Error(`Invalid archive file: ${filePath}`);
    }
    return {
        path: filePath,
        members: parsed.members.map((member, index) => {
            if (!member || typeof member.name !== "string" || typeof member.dataBase64 !== "string") {
                throw new Error(`Invalid archive member at index ${index} in ${filePath}`);
            }
            const buf = Buffer.from(member.dataBase64, "base64");
            return {
                name: member.name,
                module: (0, parser_1.parseRelBuffer)(`${filePath}:${member.name}`, buf),
            };
        }),
    };
}

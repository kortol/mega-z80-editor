"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCC_OUTPUT_FIXTURES = void 0;
exports.getSccFixture = getSccFixture;
exports.readSccFixture = readSccFixture;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const FIXTURE_DIR = node_path_1.default.join(__dirname, "__tests__");
exports.SCC_OUTPUT_FIXTURES = [
    {
        id: "hello-scc",
        kind: "program-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_hello_scc.asm"),
        features: ["helper-calls", "string-data", "loops", "comparisons", "io-calls"],
        notes: "Representative board-target program output from legacy sccz80.",
    },
    {
        id: "hello-mz80",
        kind: "program-mz80",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_hello_mz80.asm"),
        features: ["translated-output", "helper-calls", "io-calls"],
        notes: "Translator output paired with hello-scc.",
    },
    {
        id: "0crt-scc",
        kind: "runtime-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_0crt_scc.asm"),
        features: ["board-runtime", "helper-implementations", "bss-layout", "stack-layout"],
        notes: "Large board-specific runtime with helper entry points used by Small-C codegen.",
    },
    {
        id: "cpm-runtime-scc",
        kind: "runtime-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_cpmcrt_scc.asm"),
        features: ["cpm-runtime", "bdos-calls", "main-entry", "gint-helper"],
        notes: "Minimal CP/M runtime fixture used by translator/link tests.",
    },
    {
        id: "cpm-hello-scc",
        kind: "program-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_cpmhello_scc.asm"),
        features: ["cpm-program", "fputc-call", "outstr-call", "string-data"],
        notes: "Minimal CP/M-target program fixture.",
    },
    {
        id: "hello-rel",
        kind: "artifact",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_hello.rel"),
        features: ["rel-v2", "link-fixture"],
    },
    {
        id: "hello-lst",
        kind: "artifact",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_hello.lst"),
        features: ["listing", "helper-call-trace"],
    },
    {
        id: "hello-sym",
        kind: "artifact",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_hello.sym"),
        features: ["symbol-export"],
    },
];
function getSccFixture(id) {
    const fixture = exports.SCC_OUTPUT_FIXTURES.find((entry) => entry.id === id);
    if (!fixture) {
        throw new Error(`Unknown SCC fixture: ${id}`);
    }
    return fixture;
}
function readSccFixture(id) {
    return node_fs_1.default.readFileSync(getSccFixture(id).file, "utf8");
}

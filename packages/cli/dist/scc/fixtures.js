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
        id: "cpm-fputs-scc",
        kind: "program-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_cpm_fputs_scc.asm"),
        features: ["cpm-program", "fputs-call", "string-data", "stdio"],
        notes: "CP/M stdio fixture for fputs(s, fp).",
    },
    {
        id: "cpm-fgets-scc",
        kind: "program-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_cpm_fgets_scc.asm"),
        features: ["cpm-program", "fgets-call", "buffer-data", "stdio"],
        notes: "CP/M stdio fixture for fgets(buf, size, fp).",
    },
    {
        id: "cpm-gets-scc",
        kind: "program-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_cpm_gets_scc.asm"),
        features: ["cpm-program", "gets-call", "buffer-data", "stdio"],
        notes: "CP/M stdio fixture for gets(buf).",
    },
    {
        id: "cpm-getchar-scc",
        kind: "program-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_cpm_getchar_scc.asm"),
        features: ["cpm-program", "getchar-call", "stdio"],
        notes: "CP/M stdio fixture for getchar().",
    },
    {
        id: "frag-string-scc",
        kind: "fragment-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_frag_string_scc.asm"),
        features: ["string-data", "address-load"],
        notes: "Smallest fragment for string literal placement and address materialization.",
    },
    {
        id: "frag-helper-call-scc",
        kind: "fragment-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_frag_helper_call_scc.asm"),
        features: ["helper-calls", "single-call"],
        notes: "Single helper call fragment for .gint-style lowering.",
    },
    {
        id: "frag-call-scc",
        kind: "fragment-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_frag_call_scc.asm"),
        features: ["io-calls", "single-call"],
        notes: "Direct external call fragment for regular symbol call lowering.",
    },
    {
        id: "stmt-outstr-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_outstr_scc.asm"),
        features: ["string-data", "push-arg", "io-calls", "call-statement"],
        notes: "Smallest statement-level fixture that pushes a string argument and calls outstr.",
    },
    {
        id: "stmt-call-result-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_call_result_scc.asm"),
        features: ["const-load", "internal-call", "push-arg", "io-calls", "return-value"],
        notes: "Statement-level fixture that feeds an internal call result into an external output call.",
    },
    {
        id: "stmt-branch-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_branch_scc.asm"),
        features: ["branch", "internal-call", "truth-test", "push-arg", "io-calls", "numeric-local"],
        notes: "Statement-level fixture that branches on an internal call result and emits one of two characters.",
    },
    {
        id: "stmt-local-slot-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_local_slot_scc.asm"),
        features: ["local-slot", "stack-relative", "load-store", "push-arg", "io-calls"],
        notes: "Statement-level fixture that stores to and loads from a stack-relative local slot.",
    },
    {
        id: "stmt-compare-helper-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_compare_helper_scc.asm"),
        features: ["helper-call", "comparison", "branch", "push-arg", "io-calls"],
        notes: "Statement-level fixture that compares two constants via .gt and branches on the result.",
    },
    {
        id: "stmt-local-compare-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_local_compare_scc.asm"),
        features: ["helper-call", "comparison", "local-slot", "branch", "stack-relative", "io-calls"],
        notes: "Statement-level fixture that compares a stack-relative local slot via .gt and branches on the result.",
    },
    {
        id: "stmt-local-int-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_local_int_scc.asm"),
        features: ["local-slot", "stack-relative", "int-load-store", "push-arg", "io-calls"],
        notes: "Statement-level fixture that stores to and loads from a 2-byte stack-relative local int slot.",
    },
    {
        id: "stmt-eq-helper-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_eq_helper_scc.asm"),
        features: ["helper-call", "comparison", "branch", "push-arg", "io-calls", "eq-helper"],
        notes: "Statement-level fixture that compares two equal constants via .eq and branches on the result.",
    },
    {
        id: "stmt-loop-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_loop_scc.asm"),
        features: ["loop", "local-slot", "helper-call", "branch", "back-edge", "stack-relative", "io-calls"],
        notes: "Statement-level fixture that decrements a stack-relative local slot in a loop and emits a countdown.",
    },
    {
        id: "stmt-arg-char-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_arg_char_scc.asm"),
        features: ["argument", "stack-relative", "internal-call", "return-value", "io-calls"],
        notes: "Statement-level fixture that reads a 1-byte argument from the stack and returns it.",
    },
    {
        id: "stmt-arg-ne-helper-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_arg_ne_helper_scc.asm"),
        features: ["argument", "stack-relative", "helper-call", "comparison", "branch", "ne-helper", "io-calls"],
        notes: "Statement-level fixture that reads an argument from the stack, compares it via .ne, and branches on the result.",
    },
    {
        id: "stmt-arg-int-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_arg_int_scc.asm"),
        features: ["argument", "stack-relative", "int-load", "return-value", "io-calls"],
        notes: "Statement-level fixture that reads a 2-byte argument from the stack and returns it.",
    },
    {
        id: "stmt-two-arg-char-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_two_arg_char_scc.asm"),
        features: ["arguments", "stack-relative", "multi-arg", "offset-selection", "return-value", "io-calls"],
        notes: "Statement-level fixture that reads the first of two pushed byte arguments via a larger stack offset.",
    },
    {
        id: "stmt-arg-int-eq-helper-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_arg_int_eq_helper_scc.asm"),
        features: ["argument", "stack-relative", "int-load", "helper-call", "comparison", "branch", "eq-helper", "io-calls"],
        notes: "Statement-level fixture that reads a 2-byte argument from the stack, compares it via .eq, and branches on the result.",
    },
    {
        id: "stmt-two-arg-ne-helper-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_two_arg_ne_helper_scc.asm"),
        features: ["arguments", "stack-relative", "multi-arg", "helper-call", "comparison", "branch", "ne-helper", "io-calls"],
        notes: "Statement-level fixture that reads two byte arguments at different stack offsets, compares them via .ne, and branches on the result.",
    },
    {
        id: "stmt-call-two-arg-mixed-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_call_two_arg_mixed_scc.asm"),
        features: ["arguments", "stack-relative", "multi-arg", "local-slot", "caller-eval", "return-value", "io-calls"],
        notes: "Statement-level fixture that evaluates a local byte and a constant at the caller, pushes both arguments, and returns the older one.",
    },
    {
        id: "stmt-two-arg-local-ne-helper-scc",
        kind: "statement-scc",
        file: node_path_1.default.join(FIXTURE_DIR, "fixtures_stmt_two_arg_local_ne_helper_scc.asm"),
        features: ["arguments", "stack-relative", "multi-arg", "local-slot", "caller-eval", "helper-call", "comparison", "branch", "ne-helper", "io-calls"],
        notes: "Statement-level fixture that pushes a local byte and a constant as two arguments, then compares them via .ne in the callee.",
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

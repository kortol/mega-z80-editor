"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NUMERIC_C_MEMBERS = exports.NUMERIC_PROVIDERS = exports.NUMERIC_FEATURES = void 0;
exports.normalizeNumericFeatures = normalizeNumericFeatures;
exports.availableNumericFeatures = availableNumericFeatures;
exports.requireNumericFeatures = requireNumericFeatures;
exports.validateNumericProviders = validateNumericProviders;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
exports.NUMERIC_FEATURES = ["fixed", "bcd"];
exports.NUMERIC_PROVIDERS = {
    fixed: ["q8", "q16"].flatMap((type) => ["from_int", "to_int", "add", "sub", "mul", "div", "compare", "parse", "format"].map((operation) => `mz80_${type}_v1_${operation}`)),
    bcd: ["from_int", "to_int", "add", "sub", "mul", "div", "compare", "parse", "format"].map((operation) => `mz80_bcd_v1_${operation}`),
};
/** Ordered source manifest: optional files are read only for selected modules. */
exports.NUMERIC_C_MEMBERS = ["common", "conversion", "arithmetic", "comparison", "multiply", "divide", "parse", "format"];
function normalizeNumericFeatures(value) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.some((item) => !exports.NUMERIC_FEATURES.includes(item))) {
        throw new Error("Runtime features must be an array containing only fixed or bcd");
    }
    return exports.NUMERIC_FEATURES.filter((name) => value.includes(name));
}
function availableNumericFeatures() {
    const bundled = node_path_1.default.join(__dirname, "runtime", "numeric", "available.json");
    const manifest = node_fs_1.default.existsSync(bundled) ? bundled : node_path_1.default.resolve(__dirname, "../../dist/scc/runtime/numeric/available.json");
    return node_fs_1.default.existsSync(manifest) ? normalizeNumericFeatures(JSON.parse(node_fs_1.default.readFileSync(manifest, "utf8")).features) : [];
}
function requireNumericFeatures(value) {
    const requested = normalizeNumericFeatures(value);
    const available = availableNumericFeatures();
    for (const name of requested)
        if (!available.includes(name))
            throw new Error(`Runtime feature '${name}' is not included in this distribution`);
    return requested;
}
function validateNumericProviders(program, value) {
    const selected = requireNumericFeatures(value);
    const seen = new Set();
    const visit = (node) => {
        if (!node || typeof node !== "object" || seen.has(node))
            return;
        seen.add(node);
        if (node.kind === "call") {
            for (const feature of exports.NUMERIC_FEATURES) {
                if (exports.NUMERIC_PROVIDERS[feature].includes(node.target?.name) && !selected.includes(feature)) {
                    throw new Error(`Runtime feature '${feature}' must be selected for ${node.target.name}`);
                }
            }
        }
        for (const child of Object.values(node))
            visit(child);
    };
    visit(program);
}

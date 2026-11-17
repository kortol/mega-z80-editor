import fs from "node:fs";
import path from "node:path";

export type NumericFeature = "fixed" | "bcd";
export const NUMERIC_FEATURES: readonly NumericFeature[] = ["fixed", "bcd"];
export const NUMERIC_PROVIDERS: Record<NumericFeature, string[]> = {
  fixed: ["q8", "q16"].flatMap((type) => ["from_int", "to_int", "add", "sub", "mul", "div", "compare", "parse", "format"].map((operation) => `mz80_${type}_v1_${operation}`)),
  bcd: ["from_int", "to_int", "add", "sub", "mul", "div", "compare", "parse", "format"].map((operation) => `mz80_bcd_v1_${operation}`),
};

/** Ordered source manifest: optional files are read only for selected modules. */
export const NUMERIC_C_MEMBERS = ["common", "conversion", "arithmetic", "comparison", "multiply", "divide", "parse", "format"] as const;

export function normalizeNumericFeatures(value: unknown): NumericFeature[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => !NUMERIC_FEATURES.includes(item))) {
    throw new Error("Runtime features must be an array containing only fixed or bcd");
  }
  return NUMERIC_FEATURES.filter((name) => value.includes(name));
}

export function availableNumericFeatures(): NumericFeature[] {
  const bundled = path.join(__dirname, "runtime", "numeric", "available.json");
  const manifest = fs.existsSync(bundled) ? bundled : path.resolve(__dirname, "../../dist/scc/runtime/numeric/available.json");
  return fs.existsSync(manifest) ? normalizeNumericFeatures(JSON.parse(fs.readFileSync(manifest, "utf8")).features) : [];
}

export function requireNumericFeatures(value: unknown): NumericFeature[] {
  const requested = normalizeNumericFeatures(value);
  const available = availableNumericFeatures();
  for (const name of requested) if (!available.includes(name)) throw new Error(`Runtime feature '${name}' is not included in this distribution`);
  return requested;
}

export function validateNumericProviders(program: unknown, value: unknown): void {
  const selected = requireNumericFeatures(value);
  const seen = new Set<object>();
  const visit = (node: any): void => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (node.kind === "call") {
      for (const feature of NUMERIC_FEATURES) {
        if (NUMERIC_PROVIDERS[feature].includes(node.target?.name) && !selected.includes(feature)) {
          throw new Error(`Runtime feature '${feature}' must be selected for ${node.target.name}`);
        }
      }
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(program);
}

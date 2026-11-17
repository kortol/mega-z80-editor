export type NumericFeature = "fixed" | "bcd";
export declare const NUMERIC_FEATURES: readonly NumericFeature[];
export declare const NUMERIC_PROVIDERS: Record<NumericFeature, string[]>;
/** Ordered source manifest: optional files are read only for selected modules. */
export declare const NUMERIC_C_MEMBERS: readonly ["common", "conversion", "arithmetic", "comparison", "multiply", "divide", "parse", "format"];
export declare function normalizeNumericFeatures(value: unknown): NumericFeature[];
export declare function availableNumericFeatures(): NumericFeature[];
export declare function requireNumericFeatures(value: unknown): NumericFeature[];
export declare function validateNumericProviders(program: unknown, value: unknown): void;

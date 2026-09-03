export type SccFixtureKind = "program-scc" | "fragment-scc" | "program-mz80" | "runtime-scc" | "artifact";
export type SccFixtureRecord = {
    id: string;
    kind: SccFixtureKind;
    file: string;
    features: string[];
    notes?: string;
};
export declare const SCC_OUTPUT_FIXTURES: SccFixtureRecord[];
export declare function getSccFixture(id: string): SccFixtureRecord;
export declare function readSccFixture(id: string): string;

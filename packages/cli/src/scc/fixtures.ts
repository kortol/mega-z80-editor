import fs from "node:fs";
import path from "node:path";

export type SccFixtureKind =
  | "program-scc"
  | "fragment-scc"
  | "program-mz80"
  | "runtime-scc"
  | "artifact";

export type SccFixtureRecord = {
  id: string;
  kind: SccFixtureKind;
  file: string;
  features: string[];
  notes?: string;
};

const FIXTURE_DIR = path.join(__dirname, "__tests__");

export const SCC_OUTPUT_FIXTURES: SccFixtureRecord[] = [
  {
    id: "hello-scc",
    kind: "program-scc",
    file: path.join(FIXTURE_DIR, "fixtures_hello_scc.asm"),
    features: ["helper-calls", "string-data", "loops", "comparisons", "io-calls"],
    notes: "Representative board-target program output from legacy sccz80.",
  },
  {
    id: "hello-mz80",
    kind: "program-mz80",
    file: path.join(FIXTURE_DIR, "fixtures_hello_mz80.asm"),
    features: ["translated-output", "helper-calls", "io-calls"],
    notes: "Translator output paired with hello-scc.",
  },
  {
    id: "0crt-scc",
    kind: "runtime-scc",
    file: path.join(FIXTURE_DIR, "fixtures_0crt_scc.asm"),
    features: ["board-runtime", "helper-implementations", "bss-layout", "stack-layout"],
    notes: "Large board-specific runtime with helper entry points used by Small-C codegen.",
  },
  {
    id: "cpm-runtime-scc",
    kind: "runtime-scc",
    file: path.join(FIXTURE_DIR, "fixtures_cpmcrt_scc.asm"),
    features: ["cpm-runtime", "bdos-calls", "main-entry", "gint-helper"],
    notes: "Minimal CP/M runtime fixture used by translator/link tests.",
  },
  {
    id: "cpm-fgets-scc",
    kind: "program-scc",
    file: path.join(FIXTURE_DIR, "fixtures_cpm_fgets_scc.asm"),
    features: ["cpm-program", "fgets-call", "buffer-data", "stdio"],
    notes: "CP/M stdio fixture for fgets(buf, size, fp).",
  },
  {
    id: "cpm-gets-scc",
    kind: "program-scc",
    file: path.join(FIXTURE_DIR, "fixtures_cpm_gets_scc.asm"),
    features: ["cpm-program", "gets-call", "buffer-data", "stdio"],
    notes: "CP/M stdio fixture for gets(buf).",
  },
  {
    id: "frag-helper-call-scc",
    kind: "fragment-scc",
    file: path.join(FIXTURE_DIR, "fixtures_frag_helper_call_scc.asm"),
    features: ["helper-calls", "single-call"],
    notes: "Single helper call fragment for .gint-style lowering.",
  },
  {
    id: "hello-rel",
    kind: "artifact",
    file: path.join(FIXTURE_DIR, "fixtures_hello.rel"),
    features: ["rel-v2", "link-fixture"],
  },
  {
    id: "hello-lst",
    kind: "artifact",
    file: path.join(FIXTURE_DIR, "fixtures_hello.lst"),
    features: ["listing", "helper-call-trace"],
  },
  {
    id: "hello-sym",
    kind: "artifact",
    file: path.join(FIXTURE_DIR, "fixtures_hello.sym"),
    features: ["symbol-export"],
  },
];

export function getSccFixture(id: string): SccFixtureRecord {
  const fixture = SCC_OUTPUT_FIXTURES.find((entry) => entry.id === id);
  if (!fixture) {
    throw new Error(`Unknown SCC fixture: ${id}`);
  }
  return fixture;
}

export function readSccFixture(id: string): string {
  return fs.readFileSync(getSccFixture(id).file, "utf8");
}

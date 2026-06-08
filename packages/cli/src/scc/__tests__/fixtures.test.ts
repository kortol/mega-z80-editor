import fs from "node:fs";
import { getSccFixture, readSccFixture, SCC_OUTPUT_FIXTURES } from "../fixtures";

describe("SCC_OUTPUT_FIXTURES", () => {
  test("catalog entries point at existing files", () => {
    for (const fixture of SCC_OUTPUT_FIXTURES) {
      expect(fs.existsSync(fixture.file)).toBe(true);
      expect(fixture.features.length).toBeGreaterThan(0);
    }
  });

  test("catalog covers runtime and program SCC outputs", () => {
    const kinds = new Set(SCC_OUTPUT_FIXTURES.map((fixture) => fixture.kind));
    expect(kinds.has("runtime-scc")).toBe(true);
    expect(kinds.has("program-scc")).toBe(true);
    expect(kinds.has("fragment-scc")).toBe(true);
    expect(kinds.has("statement-scc")).toBe(true);
    expect(readSccFixture("hello-scc")).toContain("\t.module\thello.i");
    expect(readSccFixture("0crt-scc")).toContain("\t.globl\t.gchar,.gint,.pchar,.pint");
    expect(getSccFixture("cpm-runtime-scc").features).toContain("bdos-calls");
  });

  test("fragment fixtures isolate the first TS migration targets", () => {
    expect(readSccFixture("frag-string-scc")).toContain('.0:\t.asciz\t"HELLO"');
    expect(readSccFixture("frag-helper-call-scc")).toContain("\tcall\t.gint");
    expect(readSccFixture("frag-call-scc")).toContain("\tcall\toutstr");
    expect(readSccFixture("stmt-outstr-scc")).toContain("\tpush\thl");
  });

  test("stdio fixtures cover the remaining library entry points", () => {
    expect(readSccFixture("cpm-fputs-scc")).toContain("\tcall\tfputs");
    expect(readSccFixture("cpm-fgets-scc")).toContain("\tcall\tfgets");
    expect(readSccFixture("cpm-gets-scc")).toContain("\tcall\tgets");
    expect(readSccFixture("cpm-getchar-scc")).toContain("\tcall\tgetchar");
  });
});

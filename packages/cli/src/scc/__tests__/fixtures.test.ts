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
    expect(readSccFixture("stmt-call-result-scc")).toContain("\tcall\tvalue");
    expect(readSccFixture("stmt-branch-scc")).toContain("\tjp\tz,.2");
    expect(readSccFixture("stmt-local-slot-scc")).toContain("\tld\t(hl),#76");
    expect(readSccFixture("stmt-compare-helper-scc")).toContain("\tcall\t.gt");
    expect(readSccFixture("stmt-local-compare-scc")).toContain("\tld\t(hl),#67");
    expect(readSccFixture("stmt-local-int-scc")).toContain("\tld\ta,(hl)");
    expect(readSccFixture("stmt-eq-helper-scc")).toContain("\tcall\t.eq");
    expect(readSccFixture("stmt-loop-scc")).toContain("\tjp\t.2");
    expect(readSccFixture("stmt-arg-char-scc")).toContain("\tld\thl,#2");
    expect(readSccFixture("stmt-arg-ne-helper-scc")).toContain("\tcall\t.ne");
    expect(readSccFixture("stmt-arg-int-scc")).toContain("\tld\ta,(hl)");
    expect(readSccFixture("stmt-two-arg-char-scc")).toContain("\tld\thl,#4");
    expect(readSccFixture("stmt-arg-int-eq-helper-scc")).toContain("\tcall\t.eq");
    expect(readSccFixture("stmt-two-arg-ne-helper-scc")).toContain("\tcall\t.ne");
    expect(readSccFixture("stmt-call-two-arg-mixed-scc")).toContain("\tld\t(hl),#67");
    expect(readSccFixture("stmt-two-arg-local-ne-helper-scc")).toContain("\tld\t(hl),#67");
    expect(readSccFixture("stmt-local-int-arg-int-eq-helper-scc")).toContain("\tld\thl,#4");
    expect(readSccFixture("stmt-local-int-arg-int-ne-helper-scc")).toContain("\tcall\t.ne");
    expect(readSccFixture("stmt-local-int-arg-int-gt-helper-scc")).toContain("\tcall\t.gt");
    expect(readSccFixture("stmt-call-two-arg-int-mixed-scc")).toContain("\tld\t(hl),#83");
    expect(readSccFixture("stmt-extern-two-arg-int-call-scc")).toContain("\tcall\tpickfirst16");
  });

  test("stdio fixtures cover the remaining library entry points", () => {
    expect(readSccFixture("cpm-fputs-scc")).toContain("\tcall\tfputs");
    expect(readSccFixture("cpm-fgets-scc")).toContain("\tcall\tfgets");
    expect(readSccFixture("cpm-gets-scc")).toContain("\tcall\tgets");
    expect(readSccFixture("cpm-getchar-scc")).toContain("\tcall\tgetchar");
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger, Z80DebugCore } from "@mz80/core";
import { compileSccProgram } from "../compileProgram";
import { TsSccCompilerAdapter } from "../tsCompilerAdapter";

describe("CP/M full runtime", () => {
  test("bundled headers and basic string/ctype routines run through the TS source path", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-full-runtime-"));
    const sourcePath = path.join(tempDir, "full.c");
    const outputPath = path.join(tempDir, "full.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <string.h>",
      "#include <ctype.h>",
      "#include <stddef.h>",
      "#include <stdlib.h>",
      "#include <assert.h>",
      "int main(){ char buffer[16]; char copied[6]; char filled[4]; size_t count; strcpy(buffer, \"Ab\"); memcpy(copied, \"Cat\", 4); memset(filled, 65, 3); filled[3]=0; count=strlen(buffer); strlen(buffer); toupper(98); printf(\"%s %c %% %d %u %x %X %p\\n\", \"Hi\", 65, -12, 34, 42, 42, buffer); printf(\"%s %s %d %d %d %d\\n\", copied, filled, memcmp(\"a\", \"b\", 1), strcmp(\"b\", \"a\"), isalpha(65), tolower(65)); printf(\"%d%d%d%d%d%d\\n\", isdigit(51), islower(97), isupper(65), isspace(9), toupper(98), tolower(65)); printf(\"%d %d %d %d\\n\", NULL, count, abs(-7), atoi(\" -42x\")); assert(1); sprintf(buffer, \"%s%c%d%x%X\", \"B\", 33, 7, 42, 42); puts(buffer); return 0; }",
      "",
    ].join("\n"));
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    const result = core.run(12000);
    expect(result.reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toMatch(/^Hi A % -12 34 2a 2A 0x[0-9a-f]{4}\nCat AAA -1 1 1 97\n11116697\n0 2 7 -42\nB!72a2A\n$/);
  });

  test("bundled assert exits through the selected CRT when its condition is false", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-assert-runtime-"));
    const sourcePath = path.join(tempDir, "assert.c");
    const outputPath = path.join(tempDir, "assert.com");
    fs.writeFileSync(sourcePath, "#include <assert.h>\nint main(){ assert(0); return 0; }\n", "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(3000).reason).toBe("BDOS 0: terminate");
  });

  test("full string subset handles bounded copies, comparisons, concatenation, and character search", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-string-runtime-"));
    const sourcePath = path.join(tempDir, "string.c");
    const outputPath = path.join(tempDir, "string.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <string.h>",
      "int main(){ char joined[8]; char limited[8]; char unchanged[3]; char padded[5]; char *first; char *last; strcpy(joined, \"A\"); strcat(joined, \"B\"); strcpy(limited, \"A\"); strncat(limited, \"BC\", 1); strcpy(unchanged, \"A\"); strncat(unchanged, \"B\", 0); strncpy(padded, \"XY\", 4); first=strchr(\"cat\", 97); last=strrchr(\"aba\", 97); printf(\"%s %s %s %d %d %d %c %c\\n\", joined, limited, unchanged, padded[2], strncmp(\"ab\", \"ac\", 2), strcoll(\"ab\", \"ac\"), first[0], last[0]); return 0; }",
      "",
    ].join("\n"), "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(6000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("AB AB A 0 -1 -1 a a\n");
  });

  test("full memory subset preserves both overlapping memmove directions", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-memmove-runtime-"));
    const sourcePath = path.join(tempDir, "memmove.c");
    const outputPath = path.join(tempDir, "memmove.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <string.h>",
      "int main(){ char right[6]; char left[6]; strcpy(right, \"abcd\"); strcpy(left, \"abcde\"); memmove(right+1, right, 4); memmove(left, left+1, 5); printf(\"%s %s\\n\", right, left); return 0; }",
      "",
    ].join("\n"), "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(6000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("aabcd bcde\n");
  });

  test("C locale strxfrm returns the complete length and NUL-terminates truncation", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-strxfrm-runtime-"));
    const sourcePath = path.join(tempDir, "strxfrm.c");
    const outputPath = path.join(tempDir, "strxfrm.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <string.h>",
      "int main(){ char full[6]; char small[3]; int all; int cut; all=strxfrm(full, \"abcd\", 6); cut=strxfrm(small, \"abcd\", 3); printf(\"%d %s %d %s\\n\", all, full, cut, small); return 0; }",
      "",
    ].join("\n"), "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(6000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("4 abcd 4 ab\n");
  });

  test("full ASCII ctype subset classifies control, graphic, punctuation, and hexadecimal characters", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-ctype-runtime-"));
    const sourcePath = path.join(tempDir, "ctype.c");
    const outputPath = path.join(tempDir, "ctype.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <ctype.h>",
      "int main(){ printf(\"%d%d%d%d%d%d\\n\", isalnum(65), iscntrl(31), isgraph(32), isprint(32), ispunct(33), isxdigit(70)); return 0; }",
      "",
    ].join("\n"), "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(6000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("110111\n");
  });

  test("full string subset finds substrings, including the empty needle", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-strstr-runtime-"));
    const sourcePath = path.join(tempDir, "strstr.c");
    const outputPath = path.join(tempDir, "strstr.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <string.h>",
      "int main(){ char zero[1]; char *inside; char *empty; char *missing; zero[0]=0; inside=strstr(\"abc\", \"bc\"); empty=strstr(\"abc\", zero); missing=strstr(\"abc\", \"z\"); printf(\"%c %c %p\\n\", inside[0], empty[0], missing); return 0; }",
      "",
    ].join("\n"), "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(6000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("b a 0x0000\n");
  });

  test("full string subset finds the first accepted character with strpbrk", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-strpbrk-runtime-"));
    const sourcePath = path.join(tempDir, "strpbrk.c");
    const outputPath = path.join(tempDir, "strpbrk.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <string.h>",
      "int main(){ char *found; char *missing; found=strpbrk(\"abc\", \"xyb\"); missing=strpbrk(\"abc\", \"xy\"); printf(\"%c %p\\n\", found[0], missing); return 0; }",
      "",
    ].join("\n"), "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(6000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("b 0x0000\n");
  });

  test("full string subset calculates accepted and rejected spans", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-span-runtime-"));
    const sourcePath = path.join(tempDir, "span.c");
    const outputPath = path.join(tempDir, "span.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <string.h>",
      "int main(){ printf(\"%d %d %d\\n\", strspn(\"abc123\", \"abc\"), strcspn(\"abc123\", \"12\"), strcspn(\"abc\", \"x\")); return 0; }",
      "",
    ].join("\n"), "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(6000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("3 3 3\n");
  });

  test("full string subset tokenizes with C89 strtok continuation state", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-strtok-runtime-"));
    const sourcePath = path.join(tempDir, "strtok.c");
    const outputPath = path.join(tempDir, "strtok.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <string.h>",
      "int main(){ char text[8]; char *first; char *second; char *third; strcpy(text, \",a,,b\"); first=strtok(text, \",\"); second=strtok(0, \",\"); third=strtok(0, \",\"); printf(\"%s %s %p\\n\", first, second, third); return 0; }",
      "",
    ].join("\n"), "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(6000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("a b 0x0000\n");
  });

  test("full stdlib subset provides exit constants and deterministic rand state", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-stdlib-runtime-"));
    const sourcePath = path.join(tempDir, "stdlib.c");
    const outputPath = path.join(tempDir, "stdlib.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <stdlib.h>",
      "int main(){ int first; int second; srand(1); first=rand(); second=rand(); printf(\"%d %d %d %d\\n\", EXIT_SUCCESS, EXIT_FAILURE, first, second); return 0; }",
      "",
    ].join("\n"), "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(6000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("0 1 6 31\n");
  });

  test("stdlib exit terminates through the selected CRT", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-exit-runtime-"));
    const sourcePath = path.join(tempDir, "exit.c");
    const outputPath = path.join(tempDir, "exit.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <stdlib.h>",
      "int main(){ puts(\"before\"); exit(EXIT_SUCCESS); puts(\"after\"); return EXIT_FAILURE; }",
      "",
    ].join("\n"), "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(6000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("before\n");
  });

  test("bundled stdarg header exposes the TS-only internal variadic subset", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-stdarg-runtime-"));
    const sourcePath = path.join(tempDir, "stdarg.c");
    const outputPath = path.join(tempDir, "stdarg.com");
    fs.writeFileSync(sourcePath, [
      "#include <stdio.h>",
      "#include <stdarg.h>",
      "int sum(int first, ...){ va_list ap; int total; va_start(ap, first); total=first+va_arg(ap, int); va_end(ap); return total; }",
      "int main(){ printf(\"%d\\n\", sum(40, 2)); return 0; }",
      "",
    ].join("\n"), "utf8");
    compileSccProgram(createLogger("quiet"), {
      inputFile: sourcePath,
      outputFile: outputPath,
      runtime: { platform: "cpm", profile: "full" },
      com: true,
      orgText: "100H",
      tempDir,
    }, { compilerAdapter: new TsSccCompilerAdapter() });
    const core = new Z80DebugCore(false);
    core.setCpm22Enabled(true);
    core.setAllowOutOfImage(true);
    core.loadImage(fs.readFileSync(outputPath), 0x0100);
    core.setEntry(0x0100);
    expect(core.run(6000).reason).toBe("BDOS 0: terminate");
    expect(core.getOutput()).toBe("42\n");
  });

});

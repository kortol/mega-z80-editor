import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "../../cli/mz80-as";
import { link } from "../../cli/mz80-link";
import { createLogger } from "../../logger";
import { createArchive, loadArchiveFile } from "../archive";

describe("mz80 archive linking", () => {
  test("pulls only referenced members and follows transitive archive dependencies", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-archive-"));
    const mainAsmPath = path.join(tempDir, "main.asm");
    const fputsAsmPath = path.join(tempDir, "fputs.asm");
    const fputcAsmPath = path.join(tempDir, "fputc.asm");
    const unusedAsmPath = path.join(tempDir, "unused.asm");
    const mainRelPath = path.join(tempDir, "main.rel");
    const fputsRelPath = path.join(tempDir, "fputs.rel");
    const fputcRelPath = path.join(tempDir, "fputc.rel");
    const unusedRelPath = path.join(tempDir, "unused.rel");
    const archivePath = path.join(tempDir, "libcpm.lib");
    const outPath = path.join(tempDir, "main.com");

    fs.writeFileSync(
      mainAsmPath,
      [
        "SECTION TEXT",
        "PUBLIC MAIN",
        "EXTERN FPUTS",
        "MAIN:",
        "\tJP FPUTS",
        "END",
        "",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      fputsAsmPath,
      [
        "SECTION TEXT",
        "PUBLIC FPUTS",
        "EXTERN FPUTC",
        "FPUTS:",
        "\tJP FPUTC",
        "END",
        "",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      fputcAsmPath,
      [
        "SECTION TEXT",
        "PUBLIC FPUTC",
        "FPUTC:",
        "\tRET",
        "END",
        "",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      unusedAsmPath,
      [
        "SECTION TEXT",
        "PUBLIC UNUSED",
        "UNUSED:",
        "\tNOP",
        "\tRET",
        "END",
        "",
      ].join("\n"),
      "utf8",
    );

    const logger = createLogger("quiet");
    expect(assemble(logger, mainAsmPath, mainRelPath, { relVersion: 2 }).errors).toEqual([]);
    expect(assemble(logger, fputsAsmPath, fputsRelPath, { relVersion: 2 }).errors).toEqual([]);
    expect(assemble(logger, fputcAsmPath, fputcRelPath, { relVersion: 2 }).errors).toEqual([]);
    expect(assemble(logger, unusedAsmPath, unusedRelPath, { relVersion: 2 }).errors).toEqual([]);

    createArchive([fputsRelPath, fputcRelPath, unusedRelPath], archivePath);
    const archive = loadArchiveFile(archivePath);

    expect(archive.members.map((member) => member.name)).toEqual(["fputs.rel", "fputc.rel", "unused.rel"]);

    link([mainRelPath, archivePath], outPath, { com: true, orgText: "100H" });

    const image = fs.readFileSync(outPath);
    expect(Array.from(image)).toEqual([0xc3, 0x03, 0x01, 0xc3, 0x06, 0x01, 0xc9]);
  });

  test("pulls members across multiple archives in dependency order", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-archive-multi-"));
    const logger = createLogger("quiet");
    const mainAsmPath = path.join(tempDir, "main.asm");
    const lib1AsmPath = path.join(tempDir, "lib1.asm");
    const lib2AsmPath = path.join(tempDir, "lib2.asm");
    const mainRelPath = path.join(tempDir, "main.rel");
    const lib1RelPath = path.join(tempDir, "lib1.rel");
    const lib2RelPath = path.join(tempDir, "lib2.rel");
    const archive1Path = path.join(tempDir, "lib1.lib");
    const archive2Path = path.join(tempDir, "lib2.lib");
    const outPath = path.join(tempDir, "main.com");

    fs.writeFileSync(mainAsmPath, ["SECTION TEXT", "PUBLIC MAIN", "EXTERN STEP1", "MAIN:", "\tJP STEP1", "END", ""].join("\n"), "utf8");
    fs.writeFileSync(lib1AsmPath, ["SECTION TEXT", "PUBLIC STEP1", "EXTERN STEP2", "STEP1:", "\tJP STEP2", "END", ""].join("\n"), "utf8");
    fs.writeFileSync(lib2AsmPath, ["SECTION TEXT", "PUBLIC STEP2", "STEP2:", "\tRET", "END", ""].join("\n"), "utf8");

    expect(assemble(logger, mainAsmPath, mainRelPath, { relVersion: 2 }).errors).toEqual([]);
    expect(assemble(logger, lib1AsmPath, lib1RelPath, { relVersion: 2 }).errors).toEqual([]);
    expect(assemble(logger, lib2AsmPath, lib2RelPath, { relVersion: 2 }).errors).toEqual([]);

    createArchive([lib1RelPath], archive1Path);
    createArchive([lib2RelPath], archive2Path);
    link([mainRelPath, archive1Path, archive2Path], outPath, { com: true, orgText: "100H" });

    expect(Array.from(fs.readFileSync(outPath))).toEqual([0xc3, 0x03, 0x01, 0xc3, 0x06, 0x01, 0xc9]);
  });

  test("does not pull an archive member when the symbol is already satisfied", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-archive-dup-"));
    const logger = createLogger("quiet");
    const runtimeAsmPath = path.join(tempDir, "runtime.asm");
    const mainAsmPath = path.join(tempDir, "main.asm");
    const libraryAsmPath = path.join(tempDir, "library.asm");
    const runtimeRelPath = path.join(tempDir, "runtime.rel");
    const mainRelPath = path.join(tempDir, "main.rel");
    const libraryRelPath = path.join(tempDir, "library.rel");
    const archivePath = path.join(tempDir, "dup.lib");
    const outPath = path.join(tempDir, "dup.com");

    fs.writeFileSync(runtimeAsmPath, ["SECTION TEXT", "PUBLIC PUTCHAR", "PUTCHAR:", "\tRET", "END", ""].join("\n"), "utf8");
    fs.writeFileSync(mainAsmPath, ["SECTION TEXT", "PUBLIC MAIN", "EXTERN PUTCHAR", "MAIN:", "\tCALL PUTCHAR", "\tRET", "END", ""].join("\n"), "utf8");
    fs.writeFileSync(libraryAsmPath, ["SECTION TEXT", "PUBLIC PUTCHAR", "PUTCHAR:", "\tNOP", "\tRET", "END", ""].join("\n"), "utf8");

    expect(assemble(logger, runtimeAsmPath, runtimeRelPath, { relVersion: 2 }).errors).toEqual([]);
    expect(assemble(logger, mainAsmPath, mainRelPath, { relVersion: 2 }).errors).toEqual([]);
    expect(assemble(logger, libraryAsmPath, libraryRelPath, { relVersion: 2 }).errors).toEqual([]);
    createArchive([libraryRelPath], archivePath);

    link([mainRelPath, runtimeRelPath, archivePath], outPath, { com: true, orgText: "100H" });

    expect(Array.from(fs.readFileSync(outPath))).toEqual([0xcd, 0x04, 0x01, 0xc9, 0xc9]);
  });
});

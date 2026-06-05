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
});

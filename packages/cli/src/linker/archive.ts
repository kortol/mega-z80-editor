import * as fs from "fs";
import * as path from "path";
import { parseRelBuffer } from "./core/parser";
import { RelModule } from "./core/types";

const ARCHIVE_MAGIC = "MZ80AR1";

type ArchiveMemberRecord = {
  name: string;
  dataBase64: string;
};

type ArchiveFileRecord = {
  magic: typeof ARCHIVE_MAGIC;
  version: 1;
  members: ArchiveMemberRecord[];
};

export type ArchiveMember = {
  name: string;
  module: RelModule;
};

export type ArchiveModule = {
  path: string;
  members: ArchiveMember[];
};

export function createArchive(inputFiles: string[], outputFile: string): void {
  const members: ArchiveMemberRecord[] = inputFiles.map((inputFile) => {
    const buf = fs.readFileSync(inputFile);
    return {
      name: path.basename(inputFile),
      dataBase64: buf.toString("base64"),
    };
  });

  const archive: ArchiveFileRecord = {
    magic: ARCHIVE_MAGIC,
    version: 1,
    members,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(archive, null, 2), "utf8");
}

export function isArchivePath(filePath: string): boolean {
  return /\.(?:a|lib|mza)$/i.test(filePath);
}

export function loadArchiveFile(filePath: string): ArchiveModule {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<ArchiveFileRecord>;
  if (parsed.magic !== ARCHIVE_MAGIC || parsed.version !== 1 || !Array.isArray(parsed.members)) {
    throw new Error(`Invalid archive file: ${filePath}`);
  }

  return {
    path: filePath,
    members: parsed.members.map((member, index) => {
      if (!member || typeof member.name !== "string" || typeof member.dataBase64 !== "string") {
        throw new Error(`Invalid archive member at index ${index} in ${filePath}`);
      }
      const buf = Buffer.from(member.dataBase64, "base64");
      return {
        name: member.name,
        module: parseRelBuffer(`${filePath}:${member.name}`, buf),
      };
    }),
  };
}

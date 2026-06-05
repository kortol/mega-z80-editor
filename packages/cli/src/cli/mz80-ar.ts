import path from "path";
import { Logger } from "../logger";
import { createArchive } from "../linker/archive";

export function archiveRelFiles(logger: Logger, outputFile: string, inputFiles: string[]): void {
  createArchive(inputFiles.map((file) => path.resolve(file)), path.resolve(outputFile));
  logger.info(`Archived ${inputFiles.length} file(s): ${outputFile}`);
}

import fs from "fs";
import path from "path";
import { Logger } from "../logger";
import { translateSccAsm } from "../scc/translateAsm";

export function translateSccAsmFile(logger: Logger, inputFile: string, outputFile: string): void {
  const source = fs.readFileSync(inputFile, "utf-8");
  const translated = translateSccAsm(source, {
    moduleName: path.basename(inputFile),
  });
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, translated, "utf-8");
  logger.info(`Translated SCC asm: ${inputFile} -> ${outputFile}`);
}

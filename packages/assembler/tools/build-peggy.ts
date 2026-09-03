import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../src/assembler/grammar");
const PEG_MAIN = path.join(ROOT, "z80_asm.pegjs");
const PEGINC_DIR = ROOT;
const OUT_PATH = path.join(ROOT, "z80_asm.resolved.pegjs");

let content = fs.readFileSync(PEG_MAIN, "utf8");

// @include "filename"
content = content.replace(/^@include\s+"(.+)"$/gm, (_, incFile) => {
  const incPath = path.join(PEGINC_DIR, incFile);
  const incContent = fs.readFileSync(incPath, "utf8");
  console.log(`🔗 included: ${incFile}`);
  return `// ====== BEGIN include: ${incFile} ======\n${incContent}\n// ====== END include: ${incFile} ======`;
});

fs.writeFileSync(OUT_PATH, content);
console.log(`✅ Resolved grammar written to: ${OUT_PATH}`);

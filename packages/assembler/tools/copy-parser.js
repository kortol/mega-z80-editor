const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "src", "parser", "gen", "z80_assembler.js");
const destDir = path.join(root, "dist", "parser", "gen");
const dest = path.join(destDir, "z80_assembler.js");
const grammarSrc = path.join(root, "src", "grammar", "z80_assembler.pegjs");
const grammarDest = path.join(root, "dist", "grammar", "z80_assembler.pegjs");

if (!fs.existsSync(src)) {
  console.error(`[copy-parser] missing source: ${src}`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
fs.mkdirSync(path.dirname(grammarDest), { recursive: true });
fs.copyFileSync(grammarSrc, grammarDest);
console.log(`[copy-parser] copied to ${dest}`);
